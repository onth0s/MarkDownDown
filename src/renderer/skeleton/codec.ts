import { SKELETON } from '../../constants.js';
import { FRONTMATTER_BLOCK_RE } from '../../parser/frontmatter.js';
import { safeJsonForScript } from '../../util/escape.js';

/** Placeholder opcode: take the next prose run from the DOM, in document order. */
export const PROSE = SKELETON.PROSE;

/**
 * Opcode: consume the next DOM prose run WITHOUT emitting it. Used when a
 * PROSE slot was replaced by a source-verbatim literal (byte fidelity), so
 * run/slot alignment is preserved.
 */
export const SKIP_RUN = SKELETON.SKIP_RUN;

/** A skeleton segment: literal source text, a PROSE slot, or a SKIP_RUN. */
export type Segment = string | number;

export interface Skeleton {
  v: 1;
  /** Verbatim frontmatter text ('' when the document has none). */
  fm: string;
  /** Ordered block templates. */
  b: Segment[];
  /** Dominant line ending of the source. */
  eol: '\n' | '\r\n';
  /** Verbatim source text per PROSE slot. */
  spans?: string[] | Record<number, string>;
}

/**
 * Detect the dominant line ending of a source string.
 * Counts CRLF pairs versus bare LF; a single trailing newline never counts.
 */
export function detectEol(src: string): '\n' | '\r\n' {
  const crlf = (src.match(/\r\n/g) ?? []).length;
  const lf = (src.match(/(?<!\r)\n/g) ?? []).length;
  return crlf > lf ? '\r\n' : '\n';
}

/**
 * Extract the verbatim frontmatter block, including its `---` fences.
 * Returns '' when the document does not open with a frontmatter block.
 */
export function extractFrontmatter(src: string): string {
  const m = src.match(FRONTMATTER_BLOCK_RE);
  return m ? m[0] : '';
}

/** Read a slot's source span from either `spans` shape; undefined when absent. */
export function spanAt(spans: Skeleton['spans'], slot: number): string | undefined {
  if (!spans) return undefined;
  if (Array.isArray(spans)) {
    const v = spans[slot];
    return typeof v === 'string' ? v : undefined;
  }
  if (Object.hasOwn(spans, slot)) {
    const v = spans[slot];
    return typeof v === 'string' ? v : undefined;
  }
  return undefined;
}

/**
 * Drop every span whose DOM run already reproduces it, leaving only the slots a
 * browser genuinely cannot recover from the DOM.
 */
export function pruneSkeleton(sk: Skeleton, prose: string[]): Skeleton {
  if (!sk.spans) return sk;
  const keep: Record<number, string> = {};
  let slot = 0;
  for (const seg of sk.b) {
    if (seg !== PROSE) continue;
    const span = spanAt(sk.spans, slot);
    const run = prose[slot];
    if (span !== undefined && run !== undefined && span !== run) keep[slot] = span;
    slot++;
  }
  return { ...sk, spans: Object.keys(keep).length > 0 ? keep : undefined };
}

/**
 * Serialize the skeleton for the in-document download payload: `{name, skeleton}`.
 * `<` is escaped so source text can never break out of the `<script>` tag.
 */
export function serializeSkeletonPayload(sk: Skeleton, name: string): string {
  return safeJsonForScript({ name, skeleton: sk });
}

/** Parse and validate a skeleton JSON payload. */
export function parseSkeleton(text: string): Skeleton {
  const raw: unknown = JSON.parse(text);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('invalid skeleton payload');
  }
  const sk = raw as Partial<Skeleton>;
  if (sk.v !== 1) throw new Error(`unsupported skeleton version: ${String(sk.v)}`);
  if (!Array.isArray(sk.b) || typeof sk.fm !== 'string') {
    throw new Error('malformed skeleton structure');
  }
  return sk as Skeleton;
}

/**
 * Rebuild markdown source from a skeleton plus the prose runs read from the DOM.
 */
export function assembleFromSkeleton(sk: Skeleton, prose: string[]): string {
  let p = 0;
  const parts: string[] = [sk.fm];
  for (const seg of sk.b) {
    if (seg === PROSE) {
      parts.push(prose[p++] ?? '');
    } else if (seg === SKIP_RUN) {
      p++;
    } else {
      parts.push(String(seg));
    }
  }
  const joined = parts.join('');
  return sk.eol === '\r\n' ? joined.replace(/\n/g, '\r\n') : joined;
}
