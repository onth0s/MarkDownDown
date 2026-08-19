/**
 * Markdown++ parser: assembles markdown-it with all plugins.
 * Returns a configured MarkdownIt instance ready to tokenize .mdd source.
 */
import MarkdownIt from 'markdown-it';
import { wikilinkPlugin } from './wikilink.js';
import { diagramPlugin } from './diagram.js';
import { tablePlugin } from './table.js';
import { slugify } from '../util/slugify.js';
import { resolveFileLink } from '../util/file-link.js';

export function createMarkdownParser(): MarkdownIt {
  const md = new MarkdownIt({
    html: false,
    linkify: false,
    typographer: true,
  });

  // Allow file:, vscode:, http:, https:, mailto:, relative URLs while blocking unsafe scripting
  const BAD_PROTO_RE = /^(?:vbscript|javascript):/i;
  md.validateLink = (url: string) => {
    const trimmed = url.trim();
    return !BAD_PROTO_RE.test(trimmed);
  };

  // Add id attributes to headings for wikilink resolution and TOC.
  // Uses a core rule so IDs are present during parse (needed by extractHeadings).
  // Supports bulleted glossary/item headings: # * Term, ## * Term, ### * Term, #### * Term

  md.core.ruler.push('heading_ids', (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type === 'heading_open') {
        const inline = tokens[i + 1];
        let text = inline?.children
          ?.filter(t => t.type === 'text' || t.type === 'code_inline')
          .map(t => t.content)
          .join('') ?? '';

        // Detect bullet marker: "* Term", "- Term", "• Term"
        const bulletMatch = text.match(/^([*\-•])\s+(.+)$/);
        if (bulletMatch) {
          tokens[i].attrJoin('class', 'item-heading');
          text = bulletMatch[2].trim();
          // Clean first text child so rendered HTML has clean markup with bullet bulleted styling
          if (inline.children && inline.children[0] && inline.children[0].type === 'text') {
            inline.children[0].content = inline.children[0].content.replace(/^[*\-•]\s+/, '');
          }
        }

        tokens[i].attrSet('id', slugify(text));
      }
    }
  });

  // Support callout alerts with optional string identifier: [!] or [!STRING]
  const ALERT_RE = /^\[!(?:([a-zA-Z0-9_\u00C0-\u024F\s-]+))?\](?:\r?\n|\s+|$)/i;

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

      const rawType = (match[1] || '').trim();
      const title = rawType ? (rawType.charAt(0).toUpperCase() + rawType.slice(1)) : '';

      inlineTok.content = inlineTok.content.slice(match[0].length).trim();
      if (inlineTok.children && inlineTok.children.length > 0) {
        const firstChild = inlineTok.children[0];
        if (firstChild.type === 'text') {
          firstChild.content = firstChild.content.replace(/^\[!(?:[a-zA-Z0-9_\u00C0-\u024F\s-]+)?\](?:\r?\n|\s+)?/i, '').trim();
        }
      }

      // If the inline token is now empty and wrapped in paragraph_open/close, remove the paragraph wrapper
      if (!inlineTok.content && tokens[firstInlineIdx - 1]?.type === 'paragraph_open' && tokens[firstInlineIdx + 1]?.type === 'paragraph_close') {
        tokens.splice(firstInlineIdx - 1, 3);
      }

      const bqOpen = tokens[i];
      bqOpen.tag = 'div';
      bqOpen.attrSet('class', 'alert');
      if (title) {
        bqOpen.attrSet('id', slugify(title));
      }

      if (title) {
        const titleTok = new state.Token('html_inline', '', 0);
        titleTok.content = `<div class="alert-title"><span class="alert-label">${title}</span></div>\n`;
        tokens.splice(i + 1, 0, titleTok);
      }

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

  // Intercept links to validate and resolve file:// links
  const defaultLinkOpen = md.renderer.rules.link_open || ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const rawHref = token.attrGet('href');
    if (rawHref) {
      const baseDir = (env && env.inputDir) || process.cwd();
      const resolved = resolveFileLink(rawHref, baseDir);
      if (resolved.href !== rawHref) {
        token.attrSet('href', resolved.href);
      }
      if (!resolved.exists && resolved.warning && env && Array.isArray(env.warnings)) {
        env.warnings.push(resolved.warning);
      }
    }
    return defaultLinkOpen(tokens, idx, options, env, self);
  };

  // Splice word/word slashes in plain text with <wbr> break opportunities for mobile responsive wrapping
  const defaultTextRender = md.renderer.rules.text || ((tokens, idx) => md.utils.escapeHtml(tokens[idx].content));
  md.renderer.rules.text = (tokens, idx, options, env, self) => {
    const rendered = defaultTextRender(tokens, idx, options, env, self);
    return rendered.replace(/([a-zA-Z0-9_\u00C0-\u024F])\/([a-zA-Z0-9_\u00C0-\u024F])/g, '$1/<wbr>$2');
  };

  return md;
}
