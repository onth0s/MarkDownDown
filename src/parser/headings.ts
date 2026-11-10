import type MarkdownIt from 'markdown-it';
import { slugify } from '../util/slugify.js';
import { extractInlineText } from '../resolver/heading.js';

/**
 * Generates an environment-scoped unique slug for duplicate headings or titles.
 */
export function uniqueSlug(state: { env?: Record<string, unknown> }, text: string): string {
  state.env = state.env || {};
  if (!state.env.seenSlugs) {
    state.env.seenSlugs = new Map<string, number>();
  }
  const seen = state.env.seenSlugs as Map<string, number>;
  const baseSlug = slugify(text) || 'section';
  const count = seen.get(baseSlug) || 0;
  seen.set(baseSlug, count + 1);
  return count === 0 ? baseSlug : `${baseSlug}-${count}`;
}

/**
 * Headings plugin: computes and assigns deterministic unique id attributes to headings.
 * Supports bulleted glossary/item headings (# * Term, ## - Term, ### • Term).
 */
export function headingsPlugin(md: MarkdownIt): void {
  md.core.ruler.push('heading_ids', (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type === 'heading_open') {
        const inline = tokens[i + 1];
        let text = extractInlineText(inline?.children);

        // Detect bullet marker: "* Term", "- Term", "• Term"
        const bulletMatch = text.match(/^([*\-•])\s+(.+)$/);
        if (bulletMatch) {
          tokens[i].attrJoin('class', 'item-heading');
          text = bulletMatch[2].trim();
          // Clean first text child so rendered HTML has clean markup with bullet styling
          if (inline.children && inline.children[0] && inline.children[0].type === 'text') {
            inline.children[0].content = inline.children[0].content.replace(/^[*\-•]\s+/, '');
          }
        }

        tokens[i].attrSet('id', uniqueSlug(state, text));
      }
    }
  });
}
