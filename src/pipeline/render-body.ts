/**
 * Pipeline stage: render markdown body to HTML.
 *
 * Renders via markdown-it, injects diagram/table SVGs, and wraps code blocks
 * with copy buttons.
 */
import path from 'node:path';
import type { Options, PendingWikilink } from '../types.js';
import type MarkdownIt from 'markdown-it';
import type { ResolvedLink } from '../resolver/wikilink.js';
import { escHtml } from '../util/escape.js';
import { injectDiagramSvgs } from './inject-diagrams.js';
import { injectTableSvgs } from './inject-tables.js';
import { wrapCodeBlocksWithCopyButtons } from './copy-buttons.js';

/**
 * Render a resolved wikilink token to HTML.
 */
function renderWikilinkToken(
  target: string,
  display: string,
  resolved: ResolvedLink,
  outputMode: 'single' | 'split',
  assetBase64Map?: Map<string, string>,
  md?: MarkdownIt,
): string {
  const renderDisplay = (text: string) => (md ? md.renderInline(text) : escHtml(text));

  switch (resolved.kind) {
    case 'heading':
      return `<a href="#${resolved.heading.id}">${renderDisplay(display)}</a>`;

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
      return `<a href="${resolved.asset.relativePath}">${renderDisplay(display)}</a>`;
  }
}

export function renderBody(
  md: MarkdownIt,
  markdownBody: string,
  pendingLinks: PendingWikilink[],
  assetBase64Map: Map<string, string>,
  options: Options,
  docTitle: string,
  warnings: string[],
): string {
  // Build link lookup map for fast render-time access
  const linkMap = new Map<string, PendingWikilink>();
  for (const pw of pendingLinks) {
    linkMap.set(`${pw.target}|${pw.display}`, pw);
  }

  // Custom renderer for wikilink tokens
  md.renderer.rules['wikilink'] = (tokens, idx) => {
    const tok = tokens[idx];
    const target = tok.content;
    const display = tok.info || target;
    const pw = linkMap.get(`${target}|${display}`);
    if (!pw?.resolution) return `[[${target}]]`;
    return renderWikilinkToken(target, display, pw.resolution, options.outputMode, assetBase64Map, md);
  };

  const inputDir = path.dirname(options.inputFile);

  // Render markdown to HTML, then inject SVGs and copy buttons
  let bodyHtml = md.render(markdownBody, { warnings, inputDir, options, docTitle });
  if (!options.noDiagrams) bodyHtml = injectDiagramSvgs(bodyHtml, docTitle, warnings);
  if (!options.noTables) bodyHtml = injectTableSvgs(bodyHtml, docTitle, warnings);
  bodyHtml = wrapCodeBlocksWithCopyButtons(bodyHtml);

  return bodyHtml;
}
