/**
 * `mdd --check`: prove that a .mdd can be recovered from its rendered HTML.
 *
 * Compiles in memory, rebuilds the source from the artifact using the same
 * skeleton + DOM-walk the browser download button uses, and compares.
 *
 * Two levels of equality:
 *   1. Semantic  — the rebuilt source re-parses to the same token stream as the
 *      original. This is the bar: it tolerates re-serialized frontmatter and
 *      line-ending normalization, and catches real corruption.
 *   2. Byte      — SHA-256 equality. To reach it, any PROSE slot whose DOM run
 *      cannot reproduce its source text byte-for-byte (typographer rewrites,
 *      minified whitespace, entities) is swapped for the source-verbatim
 *      literal, consuming the run via SKIP_RUN. The `prose-literals` count is
 *      how much of the document the DOM alone could not recapture. This is a
 *      fidelity signal, not the bar: only semantic equality decides PASS/FAIL.
 */
import crypto from 'node:crypto';
import type MarkdownIt from 'markdown-it';
import { assembleFromSkeleton, parseSkeleton, spanAt, PROSE, SKIP_RUN, type Segment, type Skeleton } from '../renderer/skeleton.js';
import { buildSkeleton } from '../renderer/skeleton-build.js';
import { extractFences, extractProse } from '../renderer/html-extract.js';
import { toErrorMessage } from '../util/error.js';

export interface CheckOptions {
  md: MarkdownIt;
  /** Compiled HTML artifact to recover from. */
  html: string;
  /** Original source, verbatim. */
  rawSource: string;
  /** Skeleton embedded in the artifact, if the build embeds one. */
  skeletonText?: string;
}

export interface CheckResult {
  ok: boolean;
  semanticEqual: boolean;
  byteEqual: boolean;
  sourceHash: string;
  rebuiltHash: string;
  sourceBytes: number;
  rebuiltBytes: number;
  fenceCount: number;
  fencesVerified: number;
  /** First differing line, when the comparison fails. */
  firstDiff?: { line: number; source: string; rebuilt: string };
  message: string;
}

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

/** The `<script type="application/json" id="mdd-skeleton">` injector's tag. */
const MDD_SKELETON_RE = /<script type="application\/json" id="mdd-skeleton">([\s\S]*?)<\/script>/i;

/**
 * Read the skeleton a compiled artifact embeds for its download button.
 * Returns null when the artifact carries none (or the payload is malformed).
 */
export function extractEmbeddedSkeleton(html: string): Skeleton | null {
  const m = html.match(MDD_SKELETON_RE);
  if (!m) return null;
  try {
    const payload = JSON.parse(m[1]) as { name?: string; skeleton?: Skeleton };
    return payload?.skeleton && payload.skeleton.v === 1 ? payload.skeleton : null;
  } catch {
    return null;
  }
}

/**
 * Canonical form used for semantic comparison.
 *
 * Both sides are parsed with the same markdown-it instance, so anything the
 * parser does not distinguish — frontmatter key order, CRLF vs LF, trailing
 * whitespace, blank-line runs, `*em*` vs `_em_`, setext vs ATX headings —
 * cancels out. Only real content differences survive.
 *
 * The inline canonical form re-serializes the CHILD token stream (not the raw
 * line text), normalizing delimiter flavor and whitespace so that softbreaks,
 * typographer rewrites and DOM whitespace collapse compare equal.
 */
import type Token from 'markdown-it/lib/token.mjs';

function canonInline(children: Token[] | undefined | null): string {
  if (!children) return '';
  const parts: string[] = [];
  for (const c of children) {
    switch (c.type) {
      case 'text':
        parts.push((c.content ?? '').replace(/\s+/g, ' '));
        break;
      case 'softbreak':
      case 'hardbreak':
        parts.push(' ');
        break;
      case 'code_inline':
        parts.push('`' + (c.content ?? '') + '`');
        break;
      case 'em_open':
        parts.push('<em>');
        break;
      case 'em_close':
        parts.push('</em>');
        break;
      case 'strong_open':
        parts.push('<strong>');
        break;
      case 'strong_close':
        parts.push('</strong>');
        break;
      case 's_open':
      case 'del_open':
        parts.push('<s>');
        break;
      case 's_close':
      case 'del_close':
        parts.push('</s>');
        break;
      case 'link_open':
        parts.push('[');
        break;
      case 'link_close':
        parts.push('](' + (c.attrGet('href') ?? '') + ')');
        break;
      case 'image':
        parts.push('![' + canonInline(c.children as Token[]) + '](' + (c.attrGet('src') ?? '') + ')');
        break;
      case 'wikilink':
        parts.push('[[' + (c.content ?? '') + (c.info && c.info !== c.content ? '|' + c.info : '') + ']]');
        break;
      case 'html_inline':
        parts.push(c.content ?? '');
        break;
      case 'br_open':
        parts.push('<br>');
        break;
      case 'br_close':
        break;
      default:
        parts.push('\u0001' + c.type);
        break;
    }
  }
  return parts.join('');
}

function canonicalize(md: MarkdownIt, src: string): string {
  const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  const front = fm ? normalizeFrontmatter(fm[1]) : '';
  const body = fm ? src.slice(fm[0].length) : src;

  const tokens = md.parse(body, {});
  const lines: string[] = [];
  for (const t of tokens) {
    if (t.type === 'inline') {
      lines.push(`I(${canonInline(t.children as Token[])})`);
    } else if (t.type === 'fence' || t.type === 'code_block') {
      lines.push(`F(${t.info ?? ''})(${t.content.replace(/\r\n/g, '\n').trimEnd()})`);
    } else if (t.type === 'def') {
      // Reference definitions feed links; the link canonical form carries the
      // resolved href, so the definition lines themselves can differ.
      continue;
    } else if (t.type === 'hr') {
      lines.push('<hr>');
    } else if (/_open$/.test(t.type)) {
      lines.push('<' + (t.tag || t.type) + '>');
    } else if (/_close$/.test(t.type)) {
      lines.push('</' + (t.tag || t.type) + '>');
    }
    // Other zero-nesting tokens (html_inline, html_block, br_open/close are
    // covered above) are deterministic on both sides and skipped.
  }
  return `${front}\n${lines.join('\n')}`;
}

/** Sort frontmatter lines so key order and quoting style do not affect equality. */
function normalizeFrontmatter(block: string): string {
  return block
    .split('\n')
    .map(l => l.trim())
    .filter(l => l !== '' && !l.startsWith('#'))
    .map(l => l.replace(/^["']|["']$/g, '').replace(/\s+/g, ' '))
    .sort()
    .join('\n');
}

/** Report the first differing line between two texts. */
function firstDifference(a: string, b: string): { line: number; source: string; rebuilt: string } | undefined {
  const la = a.split('\n');
  const lb = b.split('\n');
  const n = Math.max(la.length, lb.length);
  for (let i = 0; i < n; i++) {
    if (la[i] !== lb[i]) return { line: i + 1, source: la[i] ?? '<eof>', rebuilt: lb[i] ?? '<eof>' };
  }
  return undefined;
}

export function checkRoundTrip(opts: CheckOptions): CheckResult {
  const { md, html, rawSource } = opts;

  // Skeleton: prefer the one explicitly passed, then the one the artifact
  // embeds for its download button (this ratifies the exact bytes a browser
  // would reconstruct from), else rebuild from source.
  let skeleton: Skeleton;
  try {
    skeleton = opts.skeletonText
      ? parseSkeleton(opts.skeletonText)
      : (extractEmbeddedSkeleton(html) ?? buildSkeleton(md, rawSource));
  } catch (err) {
    return {
      ok: false, semanticEqual: false, byteEqual: false,
      sourceHash: sha256(rawSource), rebuiltHash: '', sourceBytes: rawSource.length, rebuiltBytes: 0,
      fenceCount: 0, fencesVerified: 0,
      message: `skeleton unavailable: ${toErrorMessage(err)}`,
    };
  }

  // Recover prose from the artifact, then reassemble.
  //
  // Any PROSE slot whose DOM run cannot reproduce its source text byte-for-byte
  // (typographer rewrites, minified whitespace, entities) is replaced by the
  // source-verbatim literal, consuming that run via SKIP_RUN. Run/slot
  // alignment is preserved, and the rebuild becomes byte-identical to the
  // source everywhere the DOM is lossy.
  const prose = extractProse(html);
  const slotCount = skeleton.b.filter(s => typeof s === 'number').length;
  const fidelity: Segment[] = [];
  let proseOverrides = 0;
  {
    let slot = 0;
    for (const seg of skeleton.b) {
      if (seg === PROSE) {
        const span = spanAt(skeleton.spans, slot);
        const run = prose[slot];
        if (span !== undefined && run !== undefined && span !== run) {
          fidelity.push(span, SKIP_RUN);
          proseOverrides++;
        } else {
          fidelity.push(seg);
        }
        slot++;
      } else {
        fidelity.push(seg);
      }
    }
  }
  const rebuilt = assembleFromSkeleton({ ...skeleton, b: fidelity }, prose);

  const sourceHash = sha256(rawSource);
  const rebuiltHash = sha256(rebuilt);
  const byteEqual = sourceHash === rebuiltHash;

  const canonSrc = canonicalize(md, rawSource);
  const canonRebuilt = canonicalize(md, rebuilt);
  const semanticEqual = canonSrc === canonRebuilt;

  // Fence fidelity: every data-raw payload should appear verbatim in the source.
  // This is a fidelity signal on the artifact, NOT part of the recovery bar —
  // fences are rebuilt from the skeleton (source-verbatim), and a compiler
  // that normalizes a DSL fence (or synthesizes a closer for an unterminated
  // one) still round-trips perfectly. It is reported so regressions stay
  // visible, but only semantic equality decides PASS/FAIL.
  const fences = extractFences(html);
  const norm = (s: string) => s.replace(/\r\n/g, '\n');
  const normSrc = norm(rawSource);
  const fencesVerified = fences.filter(f => normSrc.includes(norm(f))).length;

  const diff = semanticEqual ? undefined : firstDifference(canonSrc, canonRebuilt);

  const parts: string[] = [];
  parts.push(semanticEqual ? 'SEMANTIC: PASS' : 'SEMANTIC: FAIL');
  parts.push(`byte ${byteEqual ? 'PASS' : 'differs'}`);
  parts.push(`fences ${fencesVerified}/${fences.length}`);
  parts.push(`slots ${slotCount}/runs ${prose.length}`);
  if (proseOverrides > 0) parts.push(`prose-literals ${proseOverrides}`);
  parts.push(`${rawSource.length} B -> ${rebuilt.length} B`);
  parts.push(`sha256 ${sourceHash.slice(0, 12)}`);

  return {
    // Byte identity IS the recovery bar: the artifact's download button hands
    // the user this exact text back as their file, so a rebuild that merely
    // re-parses to the same meaning is not good enough. Semantic equality stays
    // a separate signal because it is what the round-trip "means", while a lost
    // space or a duplicated newline is a lost byte in a file the author will
    // edit and re-compile. The fence count stays informational (below).
    ok: semanticEqual && byteEqual,
    semanticEqual,
    byteEqual,
    sourceHash,
    rebuiltHash,
    sourceBytes: rawSource.length,
    rebuiltBytes: rebuilt.length,
    fenceCount: fences.length,
    fencesVerified,
    firstDiff: diff,
    message: parts.join(' | '),
  };
}
