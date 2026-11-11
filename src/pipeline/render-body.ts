/**
 * Pipeline stage: render markdown body to HTML.
 *
 * Renders via markdown-it, injects diagram/table SVGs, and wraps code blocks
 * with copy buttons.
 */
import path from 'node:path';
import type { PendingWikilink, CompileContext } from '../types.js';
import { extractHeadings } from '../resolver/heading.js';
import type Token from 'markdown-it/lib/token.mjs';
import { injectDiagramSvgs } from './inject-diagrams.js';
import { injectTableSvgs } from './inject-tables.js';
import { injectMirrorBlocks, type MirrorStats } from './inject-mirror.js';
import { wrapCodeBlocksWithCopyButtons } from './copy-buttons.js';

export interface RenderBodyResult {
  html: string;
  mirrorStats: MirrorStats;
}

export interface RenderBodyParams {
  ctx: CompileContext;
  markdownBody: string;
  pendingLinks: PendingWikilink[];
  assetBase64Map: Map<string, string>;
  tokens?: Token[];
}

export function renderBody(params: RenderBodyParams): RenderBodyResult {
  const { ctx, markdownBody, pendingLinks, assetBase64Map, tokens } = params;
  const md = ctx.md;
  const options = ctx.options;
  const docTitle = ctx.title;
  const warnings = ctx.warnings;
  const headings = ctx.headings;

  // Build link lookup map for fast render-time access
  const linkMap = new Map<string, PendingWikilink>();
  for (const pw of pendingLinks) {
    linkMap.set(`${pw.target}|${pw.display}`, pw);
  }

  const inputDir = path.dirname(options.inputFile);

  // Render markdown to HTML, then inject SVGs, mirror blocks, and copy buttons
  const renderEnv = {
    warnings,
    inputDir,
    options,
    docTitle,
    linkMap,
    outputMode: options.outputMode,
    assetBase64Map,
    md,
  };
  let bodyHtml = tokens
    ? md.renderer.render(tokens, md.options, renderEnv)
    : md.render(markdownBody, renderEnv);
  // Create table wikilink resolver
  const tableLinkResolver = (target: string, display: string): { href: string } | null => {
    const pw = linkMap.get(`${target}|${display}`) ?? linkMap.get(`${target}|${target}`);
    if (!pw || !pw.resolution) return null;
    const resolved = pw.resolution;
    switch (resolved.kind) {
      case 'heading':
        return { href: `#${resolved.heading.id}` };
      case 'image':
      case 'video':
      case 'doc': {
        if (options.outputMode === 'single' && assetBase64Map.has(resolved.asset.absolutePath)) {
          return { href: assetBase64Map.get(resolved.asset.absolutePath)! };
        }
        return { href: resolved.asset.relativePath };
      }
    }
  };

  if (!options.noDiagrams) bodyHtml = injectDiagramSvgs(bodyHtml, docTitle, warnings);
  if (!options.noTables) bodyHtml = injectTableSvgs(bodyHtml, docTitle, warnings, tableLinkResolver);
  const docHeadings = headings ?? (tokens ? extractHeadings(tokens) : []);
  const { html: mirrorHtml, stats: mirrorStats } = injectMirrorBlocks(
    bodyHtml,
    docTitle,
    warnings,
    (text: string) => md.renderInline(text, renderEnv),
    docHeadings,
  );
  bodyHtml = wrapCodeBlocksWithCopyButtons(mirrorHtml);

  return { html: bodyHtml, mirrorStats };
}
