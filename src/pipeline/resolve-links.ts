/**
 * Pipeline stage: resolve wikilinks and build asset maps.
 *
 * Walks the token stream, resolves each [[str]] against headings and assets,
 * and builds a base64 map for single-file output mode.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Options, Heading, Asset, PendingWikilink, CompileContext } from '../types.js';
import { CompileError, toErrorMessage } from '../util/error.js';
import { resolveWikilink } from '../resolver/wikilink.js';
import { resolveFileLink } from '../util/file-link.js';
import { getMime } from '../util/mime.js';
import type Token from 'markdown-it/lib/token.mjs';

export interface ResolveResult {
  pendingLinks: PendingWikilink[];
  assetBase64Map: Map<string, string>;
}

/**
 * Extract wikilink strings from raw table/mirror block content, ignoring inline code spans
 * and backslash escapes while preserving adjacent links like [[a]][[b]].
 */
function extractWikilinksFromContent(content: string): Array<{ target: string; display: string }> {
  const links: Array<{ target: string; display: string }> = [];
  let i = 0;
  const n = content.length;

  while (i < n) {
    // Skip backslash escapes
    if (content[i] === '\\' && i + 1 < n) {
      i += 2;
      continue;
    }
    // Skip inline code spans (`...`, ``...``, etc.)
    if (content[i] === '`') {
      let ticks = 1;
      while (i + ticks < n && content[i + ticks] === '`') ticks++;
      const closeIdx = content.indexOf('`'.repeat(ticks), i + ticks);
      if (closeIdx !== -1) {
        i = closeIdx + ticks;
        continue;
      }
      i += ticks;
      continue;
    }
    // Match [[target]] or [[target|display]]
    if (content[i] === '[' && content[i + 1] === '[') {
      const closeIdx = content.indexOf(']]', i + 2);
      if (closeIdx !== -1) {
        const inner = content.slice(i + 2, closeIdx);
        if (!inner.includes('\n') && !inner.includes('[[')) {
          const pipeIdx = inner.indexOf('|');
          const target = (pipeIdx >= 0 ? inner.slice(0, pipeIdx) : inner).trim();
          const display = (pipeIdx >= 0 ? inner.slice(pipeIdx + 1) : inner).trim() || target;
          if (target) links.push({ target, display });
          i = closeIdx + 2;
          continue;
        }
      }
    }
    i++;
  }

  return links;
}

export function resolveLinks(
  tokens: Token[],
  assets: Asset[],
  ctx: CompileContext,
): ResolveResult {
  const headings: Heading[] = ctx.headings;
  const effectiveOptions: Options = ctx.options;
  const effectiveWarnings: string[] = ctx.warnings;
  const pendingLinks: PendingWikilink[] = [];
  const errors: string[] = [];

  const inputDir = path.dirname(effectiveOptions.inputFile);

  for (const token of tokens) {
    if (token.type === 'inline' && token.children) {
      for (const child of token.children) {
        if (child.type === 'wikilink') {
          const target = child.content;
          const display = child.info || target;
          try {
            const resolved = resolveWikilink(target, display, headings, assets);
            pendingLinks.push({ target, display, resolution: resolved });
          } catch (err) {
            const msg = toErrorMessage(err);
            pendingLinks.push({ target, display, resolution: null, error: msg });
            errors.push(msg);
          }
        } else if (child.type === 'link_open') {
          const rawHref = child.attrGet('href');
          if (rawHref) {
            const resolved = resolveFileLink(rawHref, inputDir);
            if (resolved.href !== rawHref) {
              child.attrSet('href', resolved.href);
            }
            if (!resolved.exists && resolved.warning) {
              effectiveWarnings.push(resolved.warning);
            }
          }
        }
      }
    } else if (token.type === 'fence') {
      const fenceKind = token.info.trim().split(/\s+/)[0]?.toLowerCase();
      if (fenceKind === 'table' || fenceKind === 'mirror') {
        const fenceLinks = extractWikilinksFromContent(token.content);
        for (const { target, display } of fenceLinks) {
          try {
            const resolved = resolveWikilink(target, display, headings, assets);
            pendingLinks.push({ target, display, resolution: resolved });
          } catch (err) {
            const msg = toErrorMessage(err);
            pendingLinks.push({ target, display, resolution: null, error: msg });
            errors.push(msg);
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new CompileError(
      'Compilation failed: unresolved or ambiguous wikilinks.\n' + errors.join('\n'),
    );
  }

  // Build asset base64 map (--single mode)
  const assetBase64Map = new Map<string, string>();
  if (effectiveOptions.outputMode === 'single') {
    const referencedPaths = new Set<string>();
    for (const pw of pendingLinks) {
      if (pw.resolution && (pw.resolution.kind === 'image' || pw.resolution.kind === 'video')) {
        referencedPaths.add(pw.resolution.asset.absolutePath);
      }
    }
    for (const token of tokens) {
      if (token.type === 'inline' && token.children) {
        for (const child of token.children) {
          if (child.type === 'image') {
            const src = child.attrGet('src');
            if (src) {
              const matching = assets.find(
                a => a.relativePath === src || path.basename(a.relativePath) === path.basename(src) || a.absolutePath === src,
              );
              if (matching) referencedPaths.add(matching.absolutePath);
            }
          }
        }
      }
    }

    const targetAssets = (tokens.length === 0 && pendingLinks.length === 0)
      ? assets
      : assets.filter(a => referencedPaths.has(a.absolutePath));

    for (const asset of targetAssets) {
      if (asset.kind === 'image' || asset.kind === 'video') {
        try {
          let data = fs.readFileSync(asset.absolutePath);
          const ext = path.extname(asset.absolutePath).slice(1).toLowerCase();
          if (ext === 'svg' && (asset.relativePath.includes('mdpp-logo') || asset.absolutePath.includes('mdpp-logo')) && effectiveOptions.accent) {
            const hex = effectiveOptions.accent.toLowerCase();
            let svgStr = data.toString('utf8');
            svgStr = svgStr.replace(/fill=["']#[0-9a-fA-F]{3,8}["']/gi, (m) => {
              if (m.toLowerCase().includes('#fff')) return m;
              return `fill="${hex}"`;
            });
            data = Buffer.from(svgStr, 'utf8');
          }
          const mime = getMime(ext);
          assetBase64Map.set(asset.absolutePath, `data:${mime};base64,${data.toString('base64')}`);
        } catch {
          effectiveWarnings.push(`Could not read asset: ${asset.relativePath}`);
        }
      }
    }
  }

  return { pendingLinks, assetBase64Map };
}
