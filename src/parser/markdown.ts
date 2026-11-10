/**
 * Markdown++ parser: assembles markdown-it with all plugins.
 * Returns a configured MarkdownIt instance ready to tokenize .mdd source.
 */
import MarkdownIt from 'markdown-it';
import { headingsPlugin } from './headings.js';
import { alertsPlugin } from './alerts.js';
import { wikilinkPlugin } from './wikilink.js';
import { customFencesPlugin } from './fence-wrapper.js';
import { mathPlugin } from './math.js';
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

  headingsPlugin(md);
  alertsPlugin(md);
  customFencesPlugin(md);
  wikilinkPlugin(md);
  mathPlugin(md);

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

  // Splice word/word slashes in plain text with <wbr> break opportunities for mobile responsive wrapping,
  // and permit safe semantic <kbd>...</kbd> keyboard shortcuts without opening arbitrary HTML injection.
  const defaultTextRender = md.renderer.rules.text || ((tokens, idx) => md.utils.escapeHtml(tokens[idx].content));
  md.renderer.rules.text = (tokens, idx, options, env, self) => {
    const rendered = defaultTextRender(tokens, idx, options, env, self);
    return rendered
      .replace(/&lt;kbd&gt;([a-zA-Z0-9_+\- ]+?)&lt;\/kbd&gt;/gi, '<kbd>$1</kbd>')
      .replace(/([a-zA-Z0-9_\u00C0-\u024F])\/([a-zA-Z0-9_\u00C0-\u024F])/g, '$1/<wbr>$2');
  };

  return md;
}
