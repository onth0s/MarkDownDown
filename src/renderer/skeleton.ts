/**
 * Source skeleton: everything needed to rebuild the original .mdd from the
 * rendered HTML, minus the prose text (which is already in the DOM).
 *
 * Why this exists
 * ---------------
 * The rendered artifact is not a faithful copy of the source. `typographer: true`
 * rewrites quotes/dashes/ellipses, markdown-it drops the distinction between
 * `*em*` and `_em_`, escapes are resolved, wikilinks become anchors, and setext
 * headings become <h1>. None of that is recoverable by reading the DOM.
 *
 * What IS recoverable for free:
 *   - diagram/table/mirror DSL: `data-raw` on each `.code-wrap` carries the
 *     complete original fence, byte-identical (verified 13/13 on showcase.mdd).
 *   - prose text: present as DOM text, modulo the transforms above.
 *
 * So the skeleton stores the *structure and markup* (which compresses to almost
 * nothing) and points at the prose runs that the DOM already holds. The result
 * is roughly 10% of source size rather than the ~42% a full gzipped copy costs.
 *
 * The skeleton is emitted as a JSON template: a list of segments, where a
 * number means "take the next DOM text run" and a string is literal source.
 */

/** Placeholder opcode: take the next prose run from the DOM, in document order. */
export const PROSE = -1;

/**
 * Opcode: consume the next DOM prose run WITHOUT emitting it. Used when a
 * PROSE slot was replaced by a source-verbatim literal (byte fidelity), so
 * run/slot alignment is preserved.
 */
export const SKIP_RUN = -2;

/** A skeleton segment: literal source text, a PROSE slot, or a SKIP_RUN. */
export type Segment = string | number;

export interface SkeletonOptions {
  /** Verbatim frontmatter block including delimiters, or '' when absent. */
  frontmatter: string;
  /** Ordered block templates covering the body. */
  body: Segment[];
  /** Fence sources in document order, keyed by 1-based index. */
  fences?: string[];
  /** Dominant line ending of the original source. */
  eol: '\n' | '\r\n';
  /**
   * Verbatim source text for each PROSE slot, in order. Enables byte fidelity:
   * when a DOM run cannot reproduce its source text exactly (typographer
   * rewrites, whitespace collapse, entities), it is swapped for this literal.
   */
  spans?: string[];
}

export interface Skeleton {
  v: 1;
  /** Verbatim frontmatter text ('' when the document has none). */
  fm: string;
  /** Ordered block templates. */
  b: Segment[];
  /** Dominant line ending of the source. */
  eol: '\n' | '\r\n';
  /** Verbatim source text for each PROSE slot, in order (see SkeletonOptions). */
  spans?: string[];
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
  const m = src.match(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/);
  return m ? m[0] : '';
}

/** Serialize a skeleton for embedding into the artifact. */
export function serializeSkeleton(sk: Skeleton): string {
  return JSON.stringify(sk);
}

/** Parse a skeleton previously produced by {@link serializeSkeleton}. */
export function parseSkeleton(text: string): Skeleton {
  const sk = JSON.parse(text) as Skeleton;
  if (sk.v !== 1) throw new Error(`unsupported skeleton version: ${String(sk.v)}`);
  return sk;
}

/**
 * Rebuild markdown source from a skeleton plus the prose runs read from the DOM.
 *
 * `prose` must be the DOM text runs in the same order the skeleton emitted its
 * PROSE placeholders; `runSkeleton` in the browser reconstructs that list.
 */
export function assembleFromSkeleton(sk: Skeleton, prose: string[]): string {
  let p = 0;
  const parts: string[] = [sk.fm];
  for (const seg of sk.b) {
    if (seg === PROSE) {
      parts.push(prose[p++] ?? '');
    } else if (seg === SKIP_RUN) {
      // Consume a DOM run that a source-verbatim literal already replaced.
      p++;
    } else if (typeof seg === 'number') {
      // Tolerate legacy sentinels: any number consumed a run.
      parts.push(prose[p++] ?? '');
    } else {
      parts.push(seg);
    }
  }
  let out = parts.join('');
  if (sk.eol === '\r\n') out = out.replace(/(?<!\r)\n/g, '\r\n');
  return out;
}
