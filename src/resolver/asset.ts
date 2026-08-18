import path from 'node:path';
import fs from 'node:fs';
import type { Asset } from '../types.js';

/** Probe order for no-extension wikilinks */
const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp'];
const VIDEO_EXTS = ['.mp4', '.webm'];
const DOC_EXTS = ['.mdd', '.md'];
const PROBE_ORDER = [...IMAGE_EXTS, ...VIDEO_EXTS, ...DOC_EXTS];

function classify(ext: string): Asset['kind'] {
  if (IMAGE_EXTS.includes(ext)) return 'image';
  if (VIDEO_EXTS.includes(ext)) return 'video';
  if (DOC_EXTS.includes(ext)) return 'mdd';
  return 'other';
}

const MAX_WALK_DEPTH = 10;

/**
 * Scan the assets directory and return all asset files.
 * Returns an empty array if the directory does not exist.
 */
export function scanAssets(assetsDir: string): Asset[] {
  if (!fs.existsSync(assetsDir)) return [];
  const results: Asset[] = [];
  function walk(dir: string, relBase: string, depth: number) {
    if (depth > MAX_WALK_DEPTH) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch { return; }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(abs, rel, depth + 1);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        results.push({
          key: rel,
          absolutePath: abs,
          relativePath: rel,
          kind: classify(ext),
        });
      }
    }
  }
  walk(assetsDir, '', 0);
  return results;
}

/**
 * Resolve a wikilink `str` against the assets directory.
 *
 * Resolution rules:
 * - If `str` contains a `.` (has extension): exact basename match only.
 * - If `str` has no extension: probe PROBE_ORDER extensions, first match wins.
 * - Subdirectory paths (e.g. `subdir/image.png`) are allowed.
 *
 * Returns the matching Asset or null if not found.
 * Throws if multiple candidates match (collision).
 */
export function resolveAsset(str: string, assets: Asset[]): Asset | null {
  const hasExtension = path.extname(str).length > 0;

  if (hasExtension) {
    // Exact basename match: check if any asset's relativePath ends with str
    const matches = assets.filter(
      (a) => a.relativePath === str || path.basename(a.relativePath) === path.basename(str)
    );
    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0];
    throw new Error(
      `[[${str}]] is ambiguous — matched ${matches.length} files:\n` +
      matches.map((m, i) => `  ${i + 1}. ${m.relativePath}`).join('\n')
    );
  }

  // No extension: probe in order
  for (const ext of PROBE_ORDER) {
    const candidate = str + ext;
    const matches = assets.filter(
      (a) => a.relativePath === candidate || path.basename(a.relativePath) === path.basename(candidate)
    );
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
      throw new Error(
        `[[${str}]] is ambiguous — matched ${matches.length} files with extension ${ext}:\n` +
        matches.map((m, i) => `  ${i + 1}. ${m.relativePath}`).join('\n')
      );
    }
  }

  return null;
}
