import type { Heading, Asset } from '../types.js';
import { resolveHeading, formatAmbiguityError } from './heading.js';
import { resolveAsset } from './asset.js';
import { toErrorMessage } from '../util/error.js';

/**
 * Describes a fully resolved wikilink ready for HTML rendering.
 */
export type ResolvedLink =
  | { kind: 'heading'; heading: Heading; display: string }
  | { kind: 'image'; asset: Asset; display: string }
  | { kind: 'video'; asset: Asset; display: string }
  | { kind: 'doc'; asset: Asset; display: string };

/**
 * Resolve a single [[str|display]] wikilink.
 *
 * Resolution order (per §2.2):
 *   0. Extension fast-path: if `str` has a file extension, skip heading
 *      resolution and go directly to asset resolution.
 *   1. Heading match (4-pass fuzzy).
 *   2. File match (probe or exact).
 *
 * Throws a compiler-error string (for stderr + exit 1) on collision or
 * not-found.
 */
export function resolveWikilink(
  target: string,
  display: string,
  headings: Heading[],
  assets: Asset[],
): ResolvedLink {
  const hasExtension = /\.[a-zA-Z0-9]+$/.test(target);

  if (!hasExtension) {
    // Step 1: heading resolution
    const headingResult = resolveHeading(target, headings);
    if (headingResult.type === 'match') {
      return { kind: 'heading', heading: headingResult.heading, display };
    }
    if (headingResult.type === 'ambiguous') {
      throw new Error(formatAmbiguityError(target, headingResult.candidates));
    }
    // 'not-found' in headings → fall through to asset resolution
  }

  // Step 2: asset resolution
  let asset: Asset | null;
  try {
    asset = resolveAsset(target, assets);
  } catch (err) {
    // Collision inside asset resolution
    throw new Error(`ERROR: ${toErrorMessage(err)}`, { cause: err });
  }

  if (asset === null) {
    throw new Error(
      `ERROR: [[${target}]] could not be resolved — no matching heading or file found.`
    );
  }

  if (asset.kind === 'image') return { kind: 'image', asset, display };
  if (asset.kind === 'video') return { kind: 'video', asset, display };
  return { kind: 'doc', asset, display };
}
