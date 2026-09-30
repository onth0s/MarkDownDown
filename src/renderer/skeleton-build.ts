/**
 * Builds a source skeleton from a markdown-it token stream.
 *
 * The skeleton is everything needed to rebuild the original .mdd from the
 * rendered artifact, minus the prose (which the DOM already holds).
 *
 * Design notes
 * ------------
 * The renderer is lossy: `typographer: true` rewrites quotes and dashes,
 * markdown-it drops the difference between `*em` and `_em`, escapes are
 * resolved, wikilinks become anchors, and setext headings become <h1>. None of
 * that can be recovered by reading the DOM, so the skeleton must carry the
 * markup. What the DOM *does* supply is the prose, so each inline text run is
 * replaced by a PROSE slot. Everything else — structural prefixes (`> `, list
 * markers, indentation), pipes, fences, blank lines — is emitted verbatim from
 * the source so the author's exact formatting survives.
 *
 * The walk is token-driven (not regex-driven): we parse the body with the same
 * markdown-it instance the pipeline uses, so every block-level mutation the
 * engine applies (github_alerts, heading_ids, alert_linebreaks) is already in
 * the token stream we walk. Prose runs are located by re-finding each text /
 * code_inline / wikilink child inside its parent inline's verbatim content:
 *
 *   - Raw content is tried first (the common case).
 *   - If that fails, the typographer-reversed form is tried ("—" <-> "---",
 *     "…" <-> "...", curly quotes <-> straight). Either the author or the
 *     typographer could have produced the character.
 *   - A length-preserving fallback keeps slot counts aligned even when a run
 *     cannot be located at all (rare escaped/entity cases) so a single miss
 *     never cascades into wholesale misalignment.
 *
 * Every PROSE slot also records the verbatim source substring it covers
 * (`spans`). The check swaps any slot whose DOM run cannot reproduce that
 * substring byte-for-byte (typographer rewrites, minified whitespace, entities)
 * for the source literal + a SKIP_RUN, which makes the rebuild byte-identical
 * to the source while keeping the skeleton tiny for everything the DOM gets
 * exactly right.
 *
 * Slot/run alignment contract (must match html-extract.ts exactly):
 *   - text runs separated only by softbreaks collapse into ONE DOM text node,
 *     so they become ONE slot (markers are merged across softbreak).
 *   - code_inline and text wikilinks are their own DOM text nodes: one slot
 *     each, and they never merge across softbreak.
 *   - image, image-wikilinks, html_inline and <br> emit no slot.
 *   - a "orphan" softbreak (between two inline elements) creates a separate
 *     whitespace-only text node in the DOM, so it gets its own slot.
 */
import type MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import { PROSE, detectEol, extractFrontmatter, type Skeleton } from './skeleton.js';

/** Block containers whose inner source is walked slice-wise. */
const CONTAINER_TYPES = new Set(['bullet_list_open', 'ordered_list_open', 'blockquote_open', 'table_open']);

/** Blocks emitted verbatim from their source slice. */
const BLOCK_LITERAL_TYPES = new Set(['fence', 'code_block', 'hr', 'html_block']);

/** Wikilink targets that render as <img>/<video> with no text node. */
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|svg|webp|avif|webm|mp4)$/i;

/** Invert the subset of typographer substitutions that change text content. */
function reverseTypo(s: string): string {
  return s
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\u2013/g, '--')
    .replace(/\u2014/g, '---');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Locate `want` inside `src` at or after `from`.
 *
 * Tiers: raw indexOf, typographer-reversed indexOf, then an escape-tolerant
 * match (each character may be preceded by one backslash). Returns the source
 * position and the number of source characters the run consumes, or null.
 */
function locate(src: string, want: string, from: number): { at: number; len: number } | null {
  let at = src.indexOf(want, from);
  if (at >= 0) return { at, len: want.length };

  const rev = reverseTypo(want);
  if (rev !== want) {
    at = src.indexOf(rev, from);
    if (at >= 0) return { at, len: rev.length };
  }

  const pat = new RegExp(want.split('').map(ch => '\\\\?' + escapeRegExp(ch)).join(''), 'y');
  for (let p = from; p + want.length <= src.length; p++) {
    if (src[p] === '\\') continue; // keep the escaping backslash in the literal
    pat.lastIndex = p;
    if (pat.test(src)) return { at: p, len: pat.lastIndex - p };
  }
  return null;
}

/**
 * Find an inline block's content inside a container's source slice.
 *
 * Container text is a verbatim slice of the source lines; `content` is
 * `inlineToken.content`, which for alert callouts has been mutated by
 * github_alerts (the `[!NOTE] ` prefix is stripped). The fallback locates the
 * first substantial alphanumeric run of the content and subtracts its offset,
 * which correctly skips prefixes like `> [!NOTE] ` and `> `.
 */
function findInBase(base: string, content: string, from: number): number {
  const direct = base.indexOf(content, from);
  if (direct >= 0) return direct;
  const m = /[A-Za-z0-9\u00C0-\u024F]{6,}/.exec(content);
  if (m) {
    const at = base.indexOf(m[0], from);
    if (at >= 0) return at - m.index;
  }
  return from;
}

/**
 * Trailing line whitespace that markdown-it strips before the inline block sees
 * it.
 *
 * The `paragraph` and `list_item` rules end with `.trim()`, so a source line's
 * trailing spaces/tabs never reach `inlineToken.content` — the renderer drops
 * them, the DOM never holds them, and no token can spell them back. The raw
 * block slice still does, so read the tail off it. Without this the rebuild
 * silently loses those bytes and the download is not the author's file.
 *
 * Returns '' unless everything between the located content and the end of its
 * line is whitespace, so a mis-located content degrades to no repair rather
 * than injecting stray indentation.
 */
function trailingWhitespace(raw: string, content: string): string {
  if (content === '' || raw.length === content.length) return '';
  const at = raw.indexOf(content);
  if (at < 0) return '';
  const tail = raw.slice(at + content.length);
  const nl = tail.indexOf('\n');
  const line = nl < 0 ? tail : tail.slice(0, nl);
  return /^[ \t]*$/.test(line) ? line : '';
}

/** True when a child produces its own DOM text node. */
function isProseChild(c: Token): boolean {
  if (c.type === 'text') return c.content !== '';
  if (c.type === 'code_inline') return c.content !== '';
  if (c.type === 'wikilink') return !IMAGE_EXT_RE.test(c.content ?? '');
  return false;
}

/**
 * Build the template segments for one inline block.
 *
 * `content` is the inline token's verbatim content; `children` are its parsed
 * children in render order. Emits literal slices of `content` for structure and
 * PROSE slots for the prose runs, in the same order the DOM lays out text
 * nodes. See the module docs for the alignment contract.
 *
 * For every PROSE slot the verbatim source substring it covers is recorded in
 * `spans`. A slot's span reaches from its first consumed source character
 * (including any softbreak newline absorbed into the DOM run) to the cursor at
 * flush time, so the check can tell exactly which slots the DOM cannot
 * reproduce byte-for-byte.
 */
function inlineSegments(content: string, children: Token[]): { segs: (string | number)[]; spans: string[] } {
  const segs: (string | number)[] = [];
  const spans: string[] = [];
  let cursor = 0;
  let openMarker = false;
  let suppressNext = false;
  let groupStart = 0;

  const flush = (): void => {
    if (openMarker) {
      segs.push(PROSE);
      spans.push(content.slice(groupStart, cursor));
      openMarker = false;
    }
  };

  // Emit the literal between the cursor and `until`, dropping one newline when
  // a softbreak's newline was absorbed into a DOM text run instead. The
  // newline's position becomes the group's source start so the slot's span
  // still covers it. Returns true when a newline was dropped.
  const emitSpan = (until: number): boolean => {
    const span = content.slice(cursor, until);
    const nl = span.indexOf('\n');
    let stripped = false;
    if (suppressNext && nl >= 0) {
      groupStart = cursor + nl;
      segs.push(span.slice(0, nl) + span.slice(nl + 1));
      stripped = true;
    } else {
      segs.push(span);
    }
    suppressNext = false;
    return stripped;
  };

  for (let i = 0; i < children.length; i++) {
    const c = children[i];

    if (c.type === 'softbreak') {
      const nxt = children[i + 1];
      if (nxt?.type === 'text' && nxt.content !== '') {
        // The newline lives inside the next DOM text node (or merges with the
        // open marker). Suppress it from the next literal span.
        suppressNext = true;
        continue;
      }
      // Softbreak before code / wikilink / markup / end. The newline is never
      // part of those nodes: with an open prose group it is absorbed into that
      // group's DOM run (the span covers it once the cursor advances), and
      // between two inline elements it is a standalone whitespace-only node.
      const nl = content.indexOf('\n', cursor);
      if (nl >= 0) {
        if (!openMarker && i > 0) {
          // Both neighbours are inline elements: the newline is a standalone
          // whitespace-only DOM text node, so it needs its own slot.
          segs.push(PROSE);
          spans.push(content.slice(nl, nl + 1));
        }
        cursor = nl + 1;
        suppressNext = false;
      } else {
        suppressNext = true;
      }
      continue;
    }

    if (c.type === 'text') {
      if (c.content === '') continue;
      const loc = locate(content, c.content, cursor);
      if (loc) {
        if (!openMarker) {
          const stripped = emitSpan(loc.at);
          if (!stripped) groupStart = loc.at;
          openMarker = true;
        }
        cursor = loc.at + loc.len;
        suppressNext = false;
      } else {
        // Cannot locate: keep the slot count aligned, advance best-effort.
        if (!openMarker) {
          const stripped = emitSpan(cursor);
          if (!stripped) groupStart = cursor;
          openMarker = true;
        }
        cursor = Math.min(cursor + c.content.length, content.length);
        suppressNext = false;
      }
      continue;
    }

    if (isProseChild(c)) {
      // code_inline / text wikilink: always its own DOM text node.
      const want = c.type === 'wikilink' ? (c.info !== undefined && c.info !== '' ? c.info : c.content) : c.content;
      if (openMarker) flush();
      const loc = locate(content, want, cursor);
      if (loc) {
        const stripped = emitSpan(loc.at);
        if (!stripped) groupStart = loc.at;
        segs.push(PROSE);
        spans.push(content.slice(groupStart, loc.at + loc.len));
        cursor = loc.at + loc.len;
      } else {
        const stripped = emitSpan(cursor);
        if (!stripped) groupStart = cursor;
        segs.push(PROSE);
        spans.push(content.slice(groupStart, Math.min(cursor + (want ?? '').length, content.length)));
        cursor = Math.min(cursor + (want ?? '').length, content.length);
      }
      suppressNext = false;
      continue;
    }

    // Markup children (em/strong/s/link/image/br/html_inline/image-wikilink).
    // No literal is emitted here: the source characters are picked up by the
    // next locate() as literal-between. suppressNext passes through markup so
    // "**em**\nmore" still drops the absorbed newline.
    flush();
  }

  flush();
  segs.push(content.slice(cursor));
  return { segs, spans };
}

/**
 * Walk a container (list / blockquote / table) against a verbatim slice of its
 * source lines. Container prefixes (`> `, `- `, indentation, `|` pipes, blank
 * lines between items) are literal; each inner inline block is templated by
 * {@link inlineSegments}.
 */
function containerSegments(base: string, inlines: Token[]): { segs: (string | number)[]; spans: string[] } {
  const segs: (string | number)[] = [];
  const spans: string[] = [];
  let cursor = 0;
  for (const tok of inlines) {
    const content = tok.content ?? '';
    if (content === '') continue; // empty paragraph: no text nodes at all
    const found = findInBase(base, content, cursor);
    segs.push(base.slice(cursor, found));
    const r = inlineSegments(content, tok.children ?? []);
    segs.push(...r.segs);
    spans.push(...r.spans);
    // Recover the line whitespace `.trim()` ate, and advance past it so the next
    // item's literal does not repeat it.
    const ws = trailingWhitespace(base.slice(found), content);
    if (ws) segs.push(ws);
    cursor = found + content.length + ws.length;
  }
  segs.push(base.slice(cursor));
  return { segs, spans };
}

interface ContainerScan {
  /** Index of the matching close token. */
  end: number;
  /** Last source line touched inside the container. */
  maxMapEnd: number;
  /** Indexes of the inline tokens inside the container, in order. */
  inlines: number[];
}

/** Find a container's scope from its opening token. */
function scanContainer(tokens: Token[], open: number): ContainerScan {
  const openType = tokens[open].type;
  const closeType = openType.replace(/_open$/, '_close');
  const inlines: number[] = [];
  let depth = 1;
  let maxMapEnd = tokens[open].map ? tokens[open].map[1] : 0;
  let j = open + 1;
  while (j < tokens.length) {
    const t = tokens[j];
    if (t.type === openType) {
      depth++;
    } else if (t.type === closeType) {
      depth--;
      if (depth === 0) break;
    }
    if (t.map) maxMapEnd = Math.max(maxMapEnd, t.map[1]);
    if (t.type === 'inline') inlines.push(j);
    j++;
  }
  return { end: j, maxMapEnd, inlines };
}

/**
 * Build a source skeleton: frontmatter verbatim, body as a linear list of
 * literal segments and PROSE slots, dominant line ending captured.
 */
export function buildSkeleton(md: MarkdownIt, rawSource: string): Skeleton {
  const eol = detectEol(rawSource);
  const src = rawSource.replace(/\r\n/g, '\n');
  const fm = extractFrontmatter(src);
  const body = fm ? src.slice(fm.length) : src;
  // split('\n') leaves a phantom '' after a trailing newline. It is not a source
  // line, and letting emitRange reach it manufactures a blank line the author
  // never wrote — which is how a body ending in one newline came back with two.
  const endsWithNewline = body.endsWith('\n');
  const lines = (endsWithNewline ? body.slice(0, -1) : body).split('\n');
  const tokens = md.parse(body, {});

  const segs: (string | number)[] = [];
  const spans: string[] = [];
  const emitInline = (content: string, children: Token[] | null | undefined): void => {
    const r = inlineSegments(content ?? '', children ?? []);
    segs.push(...r.segs);
    spans.push(...r.spans);
  };

  let last = 0;
  const emitRange = (a: number, b: number): void => {
    if (b > a) segs.push(lines.slice(a, b).join('\n') + '\n');
  };

  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    const map = t.map;

    if (t.type === 'heading_open' && map && t.nesting === 1) {
      const inlineTok = tokens[i + 1];
      const inlineIdx = i + 1;
      emitRange(last, map[0]);
      const markup = t.markup ?? '#';
      if (/^#+$/.test(markup)) {
        segs.push(markup, ' ');
        emitInline(inlineTok?.content ?? '', inlineTok?.children);
        // The heading rule trims the line too, so an ATX title can lose its
        // trailing whitespace as well.
        segs.push(trailingWhitespace(lines[map[0]] ?? '', inlineTok?.content ?? ''));
        segs.push('\n');
      } else {
        // Setext heading: title template, then the underline line verbatim.
        emitInline(inlineTok?.content ?? '', inlineTok?.children);
        if (inlineTok?.map) {
          const title = lines.slice(inlineTok.map[0], inlineTok.map[1]).join('\n');
          segs.push(trailingWhitespace(title, inlineTok.content ?? ''));
        }
        segs.push('\n');
        if (inlineTok?.map) segs.push(lines[inlineTok.map[1]], '\n');
      }
      last = map[1];
      i = inlineIdx + 2;
      continue;
    }

    if (CONTAINER_TYPES.has(t.type) && map && t.nesting === 1) {
      const c = scanContainer(tokens, i);
      const endLine = Math.max(map[1], c.maxMapEnd);
      emitRange(last, map[0]);
      const base = lines.slice(map[0], endLine).join('\n');
      const r = containerSegments(base, c.inlines.map(k => tokens[k]));
      segs.push(...r.segs);
      spans.push(...r.spans);
      segs.push('\n');
      last = endLine;
      i = c.end + 1;
      continue;
    }

    if (t.type === 'inline' && map) {
      emitRange(last, map[0]);
      emitInline(t.content ?? '', t.children);
      segs.push(trailingWhitespace(lines.slice(map[0], map[1]).join('\n'), t.content ?? ''));
      segs.push('\n');
      last = map[1];
      i++;
      continue;
    }

    if (BLOCK_LITERAL_TYPES.has(t.type) && map && t.nesting === 1) {
      emitRange(last, map[0]);
      segs.push(lines.slice(map[0], map[1]).join('\n'));
      segs.push('\n');
      last = map[1];
      i++;
      continue;
    }

    i++;
  }
  emitRange(last, lines.length);

  // Never manufacture a trailing newline for a body that has none.
  if (!endsWithNewline) {
    const lastSeg = segs[segs.length - 1];
    if (typeof lastSeg === 'string' && lastSeg.endsWith('\n')) {
      segs[segs.length - 1] = lastSeg.slice(0, -1);
    }
  }

  return { v: 1, fm, b: segs, eol, spans };
}