import type Token from 'markdown-it/lib/token.mjs';

/** Wikilink targets that render as <img>/<video> with no text node. */
export const IMAGE_EXT_RE = /\.(png|jpe?g|gif|svg|webp|avif|webm|mp4)$/i;

/** Invert the subset of typographer substitutions that change text content. */
export function reverseTypo(s: string): string {
  return s
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\u2013/g, '--')
    .replace(/\u2014/g, '---');
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Locate `want` inside `src` at or after `from`.
 *
 * Tiers: raw indexOf, typographer-reversed indexOf, then an escape-tolerant
 * match (each character may be preceded by one backslash). Returns the source
 * position and the number of source characters the run consumes, or null.
 */
export function locate(src: string, want: string, from: number): { at: number; len: number } | null {
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
export function findInBase(base: string, content: string, from: number): number {
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
 * Trailing line whitespace that markdown-it strips before the inline block sees it.
 */
export function trailingWhitespace(raw: string, content: string): string {
  if (content === '' || raw.length === content.length) return '';
  const at = raw.indexOf(content);
  if (at < 0) return '';
  const tail = raw.slice(at + content.length);
  const nl = tail.indexOf('\n');
  const line = nl < 0 ? tail : tail.slice(0, nl);
  return /^[ \t]*$/.test(line) ? line : '';
}

/** True when a child produces its own DOM text node. */
export function isProseChild(c: Token): boolean {
  if (c.type === 'text') return c.content !== '';
  if (c.type === 'code_inline') return c.content !== '';
  if (c.type === 'wikilink') return !IMAGE_EXT_RE.test(c.content ?? '');
  return false;
}
