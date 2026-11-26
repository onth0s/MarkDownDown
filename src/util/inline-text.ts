import type Token from 'markdown-it/lib/token.mjs';

/**
 * Extracts clean plain text from a markdown-it inline token's children.
 * Handles text, code spans, wikilinks, line breaks, etc.
 */
export function extractInlineText(children?: Token[] | null): string {
  if (!children || !children.length) return '';
  let out = '';
  for (const t of children) {
    if (t.type === 'text' || t.type === 'code_inline' || t.type === 'math_inline' || t.type === 'math_display') {
      out += t.content;
    } else if (t.type === 'wikilink') {
      out += t.info || t.content;
    } else if (t.type === 'softbreak' || t.type === 'hardbreak') {
      out += ' ';
    }
  }
  return out;
}
