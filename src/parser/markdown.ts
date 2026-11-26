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
import { isSafeUrl, escHtml } from '../util/escape.js';
import { resolveFileLink } from '../util/file-link.js';
import type { MarkdownRenderEnv } from '../types.js';
import { DOWNLOAD_BTNS_HTML } from '../pipeline/copy-buttons.js';

export function createMarkdownParser(): MarkdownIt {
  const md = new MarkdownIt({
    html: false,
    linkify: false,
    typographer: true,
  });

  // Allow file:, vscode:, http:, https:, mailto:, relative URLs while blocking unsafe scripting
  md.validateLink = (url: string) => isSafeUrl(url);

  headingsPlugin(md);
  alertsPlugin(md);
  customFencesPlugin(md);
  wikilinkPlugin(md);
  mathPlugin(md);

  // Resolve file:// links when md.render() is called standalone (when directWrapRender is not set, resolveLinks didn't run)
  const defaultLinkOpen = md.renderer.rules.link_open || ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const renderEnv = env as MarkdownRenderEnv | undefined;
    if (!renderEnv?.directWrapRender) {
      const token = tokens[idx];
      const rawHref = token.attrGet('href');
      if (rawHref) {
        const baseDir = renderEnv?.inputDir || process.cwd();
        const resolved = resolveFileLink(rawHref, baseDir);
        if (resolved.href !== rawHref) {
          token.attrSet('href', resolved.href);
        }
        if (!resolved.exists && resolved.warning && Array.isArray(renderEnv?.warnings)) {
          renderEnv.warnings.push(resolved.warning);
        }
      }
    }
    return defaultLinkOpen(tokens, idx, options, env, self);
  };

  // Wrap GFM <table> elements directly in .code-wrap.table when directWrapRender is active
  const defaultTableOpen = md.renderer.rules.table_open || ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.table_open = (tokens, idx, options, env, self) => {
    const renderEnv = env as MarkdownRenderEnv | undefined;
    const prefix = renderEnv?.directWrapRender
      ? `<div class="code-wrap table"><button class="copy-btn" type="button">Copy</button>${DOWNLOAD_BTNS_HTML}`
      : '';
    return prefix + defaultTableOpen(tokens, idx, options, env, self);
  };
  const defaultTableClose = md.renderer.rules.table_close || ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.table_close = (tokens, idx, options, env, self) => {
    const renderEnv = env as MarkdownRenderEnv | undefined;
    const suffix = renderEnv?.directWrapRender ? '</div>' : '';
    return defaultTableClose(tokens, idx, options, env, self) + suffix;
  };

  // Inject mirror anchor dots on target headings when mirrorAnchorMap is present
  const defaultHeadingClose = md.renderer.rules.heading_close || ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options,));
  md.renderer.rules.heading_close = (tokens, idx, options, env, self) => {
    const renderEnv = env as MarkdownRenderEnv | undefined;
    let dotHtml = '';
    if (renderEnv?.mirrorAnchorMap && renderEnv.mirrorAnchorMap.size > 0) {
      for (let j = idx - 1; j >= 0; j--) {
        if (tokens[j].type === 'heading_open') {
          const id = tokens[j].attrGet('id');
          if (id) {
            const anchor = renderEnv.mirrorAnchorMap.get(id);
            if (anchor) {
              dotHtml = ` <a href="#${escHtml(anchor.mirrorId)}" class="mirror-anchor-dot" data-mirror-target="${escHtml(anchor.mirrorId)}" title="View mirror probe: ${escHtml(anchor.title)}" aria-label="Mirror probe available"></a>`;
            }
          }
          break;
        }
      }
    }
    return dotHtml + defaultHeadingClose(tokens, idx, options, env, self);
  };

  // Splice word/word slashes in plain text with <wbr> break opportunities for mobile responsive wrapping,
  // and permit safe semantic <kbd>...</kbd> keyboard shortcuts without opening arbitrary HTML injection.
  const defaultTextRender = md.renderer.rules.text || ((tokens, idx) => md.utils.escapeHtml(tokens[idx].content));
  md.renderer.rules.text = (tokens, idx, options, env, self) => {
    const rendered = defaultTextRender(tokens, idx, options, env, self);
    return rendered
      .replace(/&lt;kbd&gt;([a-zA-Z0-9_+\- ]+?)&lt;\/kbd&gt;/gi, '<kbd>$1</kbd>')
      .replace(/([a-zA-Z0-9_\u00C0-\u024F])\/(?=[a-zA-Z0-9_\u00C0-\u024F])/g, '$1/<wbr>');
  };

  return md;
}
