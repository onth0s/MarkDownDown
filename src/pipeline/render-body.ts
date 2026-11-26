/**
 * Pipeline stage: render markdown body to HTML.
 *
 * Renders via markdown-it in a single token-level pass (diagrams, tables,
 * mirror blocks, and .code-wrap chrome are rendered directly in rules).
 */
import path from 'node:path';
import type { PendingWikilink, CompileContext, MarkdownRenderEnv } from '../types.js';
import { extractHeadings } from '../resolver/heading.js';
import { extractInlineText } from '../util/inline-text.js';
import type Token from 'markdown-it/lib/token.mjs';
import { collectMirrorAnchors, type MirrorStats } from './inject-mirror.js';

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
  const parsedTokens = tokens ?? md.parse(markdownBody, {});
  const docHeadings = headings ?? extractHeadings(parsedTokens);

  // Pre-compute nearest heading for each fence token in O(N)
  const nearestHeadingByToken = new WeakMap<Token, string>();
  let currentHeading = '';
  for (let i = 0; i < parsedTokens.length; i++) {
    const tok = parsedTokens[i];
    if (tok.type === 'heading_open') {
      const text = extractInlineText(parsedTokens[i + 1]?.children).replace(/\s+/g, ' ').trim();
      if (text) currentHeading = text;
    } else if (tok.type === 'fence' && currentHeading) {
      nearestHeadingByToken.set(tok, currentHeading);
    }
  }

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

  const mirrorAnchorMap = collectMirrorAnchors(parsedTokens, docHeadings);
  const mirrorStats: MirrorStats = { blocks: 0, items: 0, probes: 0 };
  const mirrorSeenIds = new Map<string, number>();

  const renderEnv: MarkdownRenderEnv = {
    warnings,
    inputDir,
    options,
    docTitle,
    linkMap,
    outputMode: options.outputMode,
    assetBase64Map,
    md,
    directWrapRender: true,
    tableLinkResolver,
    mirrorAnchorMap,
    mirrorStats,
    mirrorSeenIds,
    nearestHeadingByToken,
    docHeadings,
  };

  const bodyHtml = md.renderer.render(parsedTokens, md.options, renderEnv);
  return { html: bodyHtml, mirrorStats };
}
