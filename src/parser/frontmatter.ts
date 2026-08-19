/**
 * Frontmatter parser.
 * Extracts YAML frontmatter delimited by --- fences and parses it
 * into a partial Options object. Returns both the parsed options and
 * the remaining markdown body.
 */
import yaml from 'js-yaml';
import path from 'node:path';
import type { Options, HeroMeta, BgLum } from '../types.js';
import { CompileError, toErrorMessage } from '../util/error.js';

export interface FrontmatterResult {
  /** Parsed option overrides from frontmatter */
  meta: Partial<Pick<Options, 'title' | 'author' | 'assetsDir' | 'accent' | 'theme' | 'customCss' | 'customJs' | 'logo' | 'bgLum'>>;
  /** Hero presentation metadata (kicker, subtitle, pills) */
  hero: HeroMeta;
  /** The markdown body with frontmatter stripped */
  body: string;
  /** Warnings accumulated during parsing */
  warnings: string[];
}

const FENCE_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function parseBgLum(raw: unknown): BgLum | undefined {
  if (raw == null) return undefined;

  const clamp = (n: number) => Math.max(0, Math.min(1, n));

  // Option A: String format "[dark:light]", "dark:light", "[:light]", "[dark:]", "[:.1]"
  if (typeof raw === 'string') {
    const cleaned = raw.replace(/[[\]]/g, '').trim();
    if (!cleaned.includes(':')) {
      const single = parseFloat(cleaned);
      return !isNaN(single) ? { dark: clamp(single) } : undefined;
    }
    const [darkStr, lightStr] = cleaned.split(':').map((s) => s.trim());
    const result: BgLum = {};
    if (darkStr !== '') {
      const d = parseFloat(darkStr);
      if (!isNaN(d)) result.dark = clamp(d);
    }
    if (lightStr !== '') {
      const l = parseFloat(lightStr);
      if (!isNaN(l)) result.light = clamp(l);
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }

  // Option A (YAML array): [1, 0.1] or [null, 0.1] or [1]
  if (Array.isArray(raw)) {
    const result: BgLum = {};
    if (raw[0] != null) {
      const d = Number(raw[0]);
      if (!isNaN(d)) result.dark = clamp(d);
    }
    if (raw[1] != null) {
      const l = Number(raw[1]);
      if (!isNaN(l)) result.light = clamp(l);
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }

  // Option B: Object/mapping format { dark: 0.1, light: 0.9 }
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const result: BgLum = {};
    if (obj['dark'] != null) {
      const d = Number(obj['dark']);
      if (!isNaN(d)) result.dark = clamp(d);
    }
    if (obj['light'] != null) {
      const l = Number(obj['light']);
      if (!isNaN(l)) result.light = clamp(l);
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }

  return undefined;
}

export function parseFrontmatter(source: string, inputDir: string): FrontmatterResult {
  const match = source.match(FENCE_RE);
  if (!match) {
    return { meta: {}, hero: {}, body: source, warnings: [] };
  }

  const rawYaml = match[1];
  const body = match[2];

  let parsed: Record<string, unknown>;
  try {
    const result = yaml.load(rawYaml);
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw new CompileError(`Invalid frontmatter: expected a YAML key-value mapping`);
    }
    parsed = result as Record<string, unknown>;
  } catch (err) {
    if (err instanceof CompileError) throw err;
    throw new CompileError(`Invalid YAML frontmatter: ${toErrorMessage(err)}`);
  }

  const VALID_KEYS = new Set([
    'title', 'author', 'accent', 'theme', 'bg_lum', 'bg-lum', 'bglum',
    'kicker', 'subtitle', 'pills',
    'assets_dir', 'custom_css', 'custom_js', 'logo'
  ]);

  for (const key of Object.keys(parsed)) {
    if (!VALID_KEYS.has(key)) {
      throw new CompileError(`Invalid frontmatter key "${key}". Valid keys: ${[...VALID_KEYS].join(', ')}`);
    }
  }

  const meta: FrontmatterResult['meta'] = {};
  const hero: HeroMeta = {};

  if (parsed['title'] !== undefined) {
    if (typeof parsed['title'] !== 'string') {
      throw new CompileError(`Invalid frontmatter: "title" must be a string`);
    }
    meta.title = parsed['title'];
  }

  if (parsed['author'] !== undefined) {
    if (typeof parsed['author'] !== 'string') {
      throw new CompileError(`Invalid frontmatter: "author" must be a string`);
    }
    meta.author = parsed['author'];
  }

  if (parsed['accent'] !== undefined) {
    if (typeof parsed['accent'] !== 'string') {
      throw new CompileError(`Invalid frontmatter: "accent" must be a string hex color (e.g. "#3b82f6")`);
    }
    meta.accent = parsed['accent'];
  }

  if (parsed['theme'] !== undefined) {
    const themeVal = String(parsed['theme']).trim().toLowerCase();
    if (themeVal !== 'dark' && themeVal !== 'light') {
      throw new CompileError(`Invalid frontmatter: "theme" must be either "dark" or "light"`);
    }
    meta.theme = themeVal as 'dark' | 'light';
  }

  const rawBgLum = parsed['bg_lum'] ?? parsed['bg-lum'] ?? parsed['bglum'];
  if (rawBgLum !== undefined) {
    const parsedLum = parseBgLum(rawBgLum);
    if (!parsedLum) {
      throw new CompileError(`Invalid frontmatter: "bg_lum" must be a valid slice string (e.g. "0.0 : 0.95"), array (e.g. [0.0, 0.95]), or mapping (e.g. { dark: 0.0, light: 0.95 }) with values between 0.0 and 1.0`);
    }
    meta.bgLum = parsedLum;
  }

  if (parsed['kicker'] !== undefined) {
    if (typeof parsed['kicker'] !== 'string') {
      throw new CompileError(`Invalid frontmatter: "kicker" must be a string`);
    }
    hero.kicker = parsed['kicker'];
  }

  if (parsed['subtitle'] !== undefined) {
    if (typeof parsed['subtitle'] !== 'string') {
      throw new CompileError(`Invalid frontmatter: "subtitle" must be a string`);
    }
    hero.subtitle = parsed['subtitle'];
  }

  if (parsed['pills'] !== undefined) {
    if (!Array.isArray(parsed['pills']) || !parsed['pills'].every((p: unknown) => typeof p === 'string')) {
      throw new CompileError(`Invalid frontmatter: "pills" must be an array of strings`);
    }
    hero.pills = parsed['pills'] as string[];
  }

  if (parsed['assets_dir'] !== undefined) {
    if (typeof parsed['assets_dir'] !== 'string') {
      throw new CompileError(`Invalid frontmatter: "assets_dir" must be a file path string`);
    }
    meta.assetsDir = path.resolve(inputDir, parsed['assets_dir']);
  }

  if (parsed['custom_css'] !== undefined) {
    if (typeof parsed['custom_css'] !== 'string') {
      throw new CompileError(`Invalid frontmatter: "custom_css" must be a file path string`);
    }
    meta.customCss = path.resolve(inputDir, parsed['custom_css']);
  }

  if (parsed['custom_js'] !== undefined) {
    if (typeof parsed['custom_js'] !== 'string') {
      throw new CompileError(`Invalid frontmatter: "custom_js" must be a file path string`);
    }
    meta.customJs = path.resolve(inputDir, parsed['custom_js']);
  }

  if (parsed['logo'] !== undefined) {
    if (typeof parsed['logo'] !== 'string') {
      throw new CompileError(`Invalid frontmatter: "logo" must be a file path string`);
    }
    meta.logo = path.resolve(inputDir, parsed['logo']);
  }

  return { meta, hero, body, warnings: [] };
}
