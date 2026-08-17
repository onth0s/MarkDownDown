/**
 * Frontmatter parser.
 * Extracts YAML frontmatter delimited by --- fences and parses it
 * into a partial Options object. Returns both the parsed options and
 * the remaining markdown body.
 */
import yaml from 'js-yaml';
import path from 'node:path';
import type { Options } from '../types.js';

export interface FrontmatterResult {
  /** Parsed option overrides from frontmatter */
  meta: Partial<Pick<Options, 'title' | 'author' | 'assetsDir' | 'accent' | 'customCss' | 'customJs'>>;
  /** The markdown body with frontmatter stripped */
  body: string;
}

const FENCE_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function parseFrontmatter(source: string, inputDir: string): FrontmatterResult {
  const match = source.match(FENCE_RE);
  if (!match) {
    return { meta: {}, body: source };
  }

  const rawYaml = match[1];
  const body = match[2];

  let parsed: Record<string, unknown> = {};
  try {
    const result = yaml.load(rawYaml);
    if (result && typeof result === 'object') {
      parsed = result as Record<string, unknown>;
    }
  } catch {
    // Invalid YAML: ignore frontmatter, treat as body
    return { meta: {}, body: source };
  }

  const meta: FrontmatterResult['meta'] = {};

  if (typeof parsed['title'] === 'string') meta.title = parsed['title'];
  if (typeof parsed['author'] === 'string') meta.author = parsed['author'];
  if (typeof parsed['accent'] === 'string') meta.accent = parsed['accent'];

  if (typeof parsed['assets_dir'] === 'string') {
    meta.assetsDir = path.resolve(inputDir, parsed['assets_dir']);
  }
  if (typeof parsed['custom_css'] === 'string') {
    meta.customCss = path.resolve(inputDir, parsed['custom_css']);
  }
  if (typeof parsed['custom_js'] === 'string') {
    meta.customJs = path.resolve(inputDir, parsed['custom_js']);
  }

  return { meta, body };
}
