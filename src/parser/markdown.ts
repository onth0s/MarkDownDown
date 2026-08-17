/**
 * Markdown++ parser: assembles markdown-it with all plugins.
 * Returns a configured MarkdownIt instance ready to tokenize .mdd source.
 */
import MarkdownIt from 'markdown-it';
import { wikilinkPlugin } from './wikilink.js';
import { diagramPlugin } from './diagram.js';
import { tablePlugin } from './table.js';

export function createMarkdownParser(): MarkdownIt {
  const md = new MarkdownIt({
    html: false,
    linkify: false,
    typographer: true,
  });

  // Add id attributes to headings for wikilink resolution and TOC.
  // Uses a core rule so IDs are present during parse (needed by extractHeadings).
  const slugify = (s: string): string =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

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

/**
 * Render a wikilink token to HTML.
 * Called during the render pass after all links are resolved.
 */
export function renderWikilinkToken(
  target: string,
  display: string,
  resolved: import('../resolver/collision.js').ResolvedLink,
  outputMode: 'single' | 'split',
  assetBase64Map?: Map<string, string>
): string {
  switch (resolved.kind) {
    case 'heading':
      return `<a href="#${resolved.heading.id}">${escHtml(display)}</a>`;

    case 'image': {
      if (outputMode === 'single' && assetBase64Map?.has(resolved.asset.absolutePath)) {
        const b64 = assetBase64Map.get(resolved.asset.absolutePath)!;
        return `<img src="${b64}" alt="${escHtml(display)}">`;
      }
      return `<img src="${resolved.asset.relativePath}" alt="${escHtml(display)}">`;
    }

    case 'video': {
      if (outputMode === 'single' && assetBase64Map?.has(resolved.asset.absolutePath)) {
        const b64 = assetBase64Map.get(resolved.asset.absolutePath)!;
        return `<video src="${b64}" controls></video>`;
      }
      return `<video src="${resolved.asset.relativePath}" controls></video>`;
    }

    case 'doc':
      return `<a href="${resolved.asset.relativePath}">${escHtml(display)}</a>`;
  }
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
