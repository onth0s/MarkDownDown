/**
 * Pipeline stage: resolve wikilinks and build asset maps.
 *
 * Walks the token stream, resolves each [[str]] against headings and assets,
 * and builds a base64 map for single-file output mode.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Options, Heading, Asset, PendingWikilink } from '../types.js';
import { CompileError } from '../types.js';
import { resolveWikilink } from '../resolver/wikilink.js';
import { getMime } from '../util/mime.js';
import { toErrorMessage } from '../util/error.js';
import type Token from 'markdown-it/lib/token.mjs';

export interface ResolveResult {
  pendingLinks: PendingWikilink[];
  assetBase64Map: Map<string, string>;
}

export function resolveLinks(
  tokens: Token[],
  headings: Heading[],
  assets: Asset[],
  options: Options,
  warnings: string[],
): ResolveResult {
  const pendingLinks: PendingWikilink[] = [];
  const errors: string[] = [];

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
  if (options.outputMode === 'single') {
    for (const asset of assets) {
      if (asset.kind === 'image' || asset.kind === 'video') {
        try {
          const data = fs.readFileSync(asset.absolutePath);
          const ext = path.extname(asset.absolutePath).slice(1).toLowerCase();
          const mime = getMime(ext);
          assetBase64Map.set(asset.absolutePath, `data:${mime};base64,${data.toString('base64')}`);
        } catch {
          warnings.push(`Could not read asset: ${asset.relativePath}`);
        }
      }
    }
  }

  return { pendingLinks, assetBase64Map };
}
