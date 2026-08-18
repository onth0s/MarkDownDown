/**
 * Pipeline stage: resolve wikilinks and build asset maps.
 *
 * Walks the token stream, resolves each [[str]] against headings and assets,
 * and builds a base64 map for single-file output mode.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Options, Heading, Asset, PendingWikilink } from '../types.js';
import { resolveWikilink } from '../resolver/collision.js';
import { getMime } from '../util/mime.js';
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
  let hadErrors = false;

  for (const token of tokens) {
    if (token.type === 'inline' && token.children) {
      for (const child of token.children) {
        if (child.type === 'wikilink') {
          const target = child.content;
          const display = child.info || target;
          try {
            const resolved = resolveWikilink(target, display, headings, assets);
            pendingLinks.push({ target, display, resolved });
          } catch (err) {
            const msg = (err as Error).message;
            pendingLinks.push({ target, display, error: msg });
            process.stderr.write(msg + '\n');
            hadErrors = true;
          }
        }
      }
    }
  }

  if (hadErrors) {
    throw new Error('Compilation failed: unresolved or ambiguous wikilinks. See stderr.');
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
