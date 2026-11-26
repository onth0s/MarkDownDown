import path from 'node:path';
import type { Heading, Asset, ResolvedLink } from '../types.js';
import { resolveHeading, formatAmbiguityError } from './heading.js';
import { resolveAsset, KNOWN_ASSET_EXTENSIONS } from './asset.js';
import { CompileError } from '../util/error.js';

export type { ResolvedLink };

function toAssetLink(asset: Asset, display: string): ResolvedLink {
  if (asset.kind === 'image') return { kind: 'image', asset, display };
  if (asset.kind === 'video') return { kind: 'video', asset, display };
  return { kind: 'doc', asset, display };
}

/**
 * Resolve a single [[str|display]] wikilink.
 *
 * Resolution order:
 *   - Known asset extension (.png, .svg, .mdd, ...): try asset first, then heading.
 *   - Otherwise: try 4-pass fuzzy heading match first, then asset probe.
 */
export function resolveWikilink(
  target: string,
  display: string,
  headings: Heading[],
  assets: Asset[],
): ResolvedLink {
  const ext = path.extname(target).toLowerCase();
  if (KNOWN_ASSET_EXTENSIONS.has(ext)) {
    const asset = resolveAsset(target, assets);
    if (asset) return toAssetLink(asset, display);
  }

  const headingResult = resolveHeading(target, headings);
  if (headingResult.type === 'match') {
    return { kind: 'heading', heading: headingResult.heading, display };
  }
  if (headingResult.type === 'ambiguous') {
    throw new CompileError(formatAmbiguityError(target, headingResult.candidates));
  }

  const asset = resolveAsset(target, assets);
  if (asset !== null) {
    return toAssetLink(asset, display);
  }

  throw new CompileError(
    `[[${target}]] could not be resolved — no matching heading or file found.`
  );
}
