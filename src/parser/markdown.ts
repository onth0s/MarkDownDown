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

  // Support GitHub-style alerts: [!NOTE], [!TIP], [!IMPORTANT], [!WARNING], [!CAUTION]
  const ALERT_TITLES: Record<string, string> = {
    NOTE: 'Note',
    TIP: 'Tip',
    IMPORTANT: 'Important',
    WARNING: 'Warning',
    CAUTION: 'Caution',
  };
  const ALERT_RE = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\r?\n|$)/i;

  md.core.ruler.after('block', 'github_alerts', (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'blockquote_open') continue;

      let firstInlineIdx = -1;
      for (let j = i + 1; j < tokens.length; j++) {
        if (tokens[j].type === 'blockquote_close') break;
        if (tokens[j].type === 'inline') {
          firstInlineIdx = j;
          break;
        }
      }

      if (firstInlineIdx === -1) continue;
      const inlineTok = tokens[firstInlineIdx];
      const match = inlineTok.content.match(ALERT_RE);
      if (!match) continue;

      const type = match[1].toUpperCase();
      const title = ALERT_TITLES[type] ?? type;

      inlineTok.content = inlineTok.content.slice(match[0].length).trim();
      if (inlineTok.children && inlineTok.children.length > 0) {
        const firstChild = inlineTok.children[0];
        if (firstChild.type === 'text') {
          firstChild.content = firstChild.content.replace(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\r?\n)?/i, '').trim();
        }
      }

      // If the inline token is now empty and wrapped in paragraph_open/close, remove the paragraph wrapper
      if (!inlineTok.content && tokens[firstInlineIdx - 1]?.type === 'paragraph_open' && tokens[firstInlineIdx + 1]?.type === 'paragraph_close') {
        tokens.splice(firstInlineIdx - 1, 3);
      }

      const bqOpen = tokens[i];
      bqOpen.tag = 'div';
      bqOpen.attrSet('class', `alert alert-${type.toLowerCase()}`);

      const titleTok = new state.Token('html_inline', '', 0);
      titleTok.content = `<div class="alert-title"><span class="alert-icon"></span><span class="alert-label">${title}</span></div>\n`;
      tokens.splice(i + 1, 0, titleTok);

      let depth = 1;
      for (let k = i + 2; k < tokens.length; k++) {
        if (tokens[k].type === 'blockquote_open') depth++;
        else if (tokens[k].type === 'blockquote_close') {
          depth--;
          if (depth === 0) {
            tokens[k].tag = 'div';
            break;
          }
        }
      }
    }
  });

  diagramPlugin(md);
  tablePlugin(md);
  wikilinkPlugin(md);

  // Splice word/word slashes in plain text with <wbr> break opportunities for mobile responsive wrapping
  const defaultTextRender = md.renderer.rules.text || ((tokens, idx) => md.utils.escapeHtml(tokens[idx].content));
  md.renderer.rules.text = (tokens, idx, options, env, self) => {
    const rendered = defaultTextRender(tokens, idx, options, env, self);
    return rendered.replace(/([a-zA-Z0-9_\u00C0-\u024F])\/([a-zA-Z0-9_\u00C0-\u024F])/g, '$1/<wbr>$2');
  };

  return md;
}
