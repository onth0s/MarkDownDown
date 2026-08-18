/**
 * Markdown++ parser: assembles markdown-it with all plugins.
 * Returns a configured MarkdownIt instance ready to tokenize .mdd source.
 */
import MarkdownIt from 'markdown-it';
import { wikilinkPlugin } from './wikilink.js';
import { diagramPlugin } from './diagram.js';
import { tablePlugin } from './table.js';
import { slugify } from '../util/slugify.js';

export function createMarkdownParser(): MarkdownIt {
  const md = new MarkdownIt({
    html: false,
    linkify: false,
    typographer: true,
  });

  // Add id attributes to headings for wikilink resolution and TOC.
  // Uses a core rule so IDs are present during parse (needed by extractHeadings).

  md.core.ruler.push('heading_ids', (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type === 'heading_open') {
        const inline = tokens[i + 1];
        const text = inline?.children
          ?.filter(t => t.type === 'text' || t.type === 'code_inline')
          .map(t => t.content)
          .join('') ?? '';
        tokens[i].attrSet('id', slugify(text));
      }
    }
  });

  diagramPlugin(md);
  tablePlugin(md);
  wikilinkPlugin(md);

  return md;
}
