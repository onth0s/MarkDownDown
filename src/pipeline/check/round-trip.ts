import crypto from 'node:crypto';
import type MarkdownIt from 'markdown-it';
import { assembleFromSkeleton, parseSkeleton, spanAt, PROSE, SKIP_RUN, type Segment, type Skeleton } from '../../renderer/skeleton.js';
import { buildSkeleton } from '../../renderer/skeleton/index.js';
import { extractFences, extractProse } from '../../renderer/html-extract.js';
import { toErrorMessage } from '../../util/error.js';
import { canonicalize, firstDifference } from './canonicalize.js';

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

export function sha256(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

/** The `<script type="application/json" id="mdd-skeleton">` injector's tag. */
export const MDD_SKELETON_RE = /<script type="application\/json" id="mdd-skeleton">([\s\S]*?)<\/script>/i;

/**
 * Read the embedded skeleton payload object from a compiled artifact.
 */
export function extractEmbeddedSkeletonPayload(html: string): { name?: string; skeleton: Skeleton } | null {
  const m = html.match(MDD_SKELETON_RE);
  if (!m) return null;
  try {
    const payload = JSON.parse(m[1]) as { name?: string; skeleton?: Skeleton };
    if (payload?.skeleton && payload.skeleton.v === 1) {
      return { name: payload.name, skeleton: payload.skeleton };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Read the skeleton a compiled artifact embeds for its download button.
 * Returns null when the artifact carries none (or the payload is malformed).
 */
export function extractEmbeddedSkeleton(html: string): Skeleton | null {
  return extractEmbeddedSkeletonPayload(html)?.skeleton ?? null;
}

export function checkRoundTrip(opts: CheckOptions): CheckResult {
  const { md, html, rawSource } = opts;

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
