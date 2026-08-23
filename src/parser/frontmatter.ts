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
import { isValidHex, formatHexWithHash } from '../util/color.js';

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

  const validateString = (key: string, customMsg?: string): string => {
    const val = parsed[key];
    if (typeof val !== 'string') {
      throw new CompileError(customMsg ?? `Invalid frontmatter: "${key}" must be a string`);
    }
    return val;
  };

  const validatePath = (key: string): string => {
    const val = validateString(key, `Invalid frontmatter: "${key}" must be a file path string`);
    return path.resolve(inputDir, val);
  };

  if (parsed['title'] !== undefined) meta.title = validateString('title');
  if (parsed['author'] !== undefined) meta.author = validateString('author');
  if (parsed['accent'] !== undefined) {
    const rawAccent = parsed['accent'];
    if (!isValidHex(rawAccent)) {
      throw new CompileError(`Invalid frontmatter: "accent" must be a valid 3- or 6-digit hex color (e.g. "#3b82f6", "FFF", or "000"), got "${String(rawAccent)}"`);
    }
    meta.accent = formatHexWithHash(rawAccent as string | number);
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

  if (parsed['kicker'] !== undefined) hero.kicker = validateString('kicker');
  if (parsed['subtitle'] !== undefined) hero.subtitle = validateString('subtitle');
  if (parsed['pills'] !== undefined) {
    if (!Array.isArray(parsed['pills']) || !parsed['pills'].every((p: unknown) => typeof p === 'string')) {
      throw new CompileError(`Invalid frontmatter: "pills" must be an array of strings`);
    }
    hero.pills = parsed['pills'] as string[];
  }

  if (parsed['assets_dir'] !== undefined) meta.assetsDir = validatePath('assets_dir');
  if (parsed['custom_css'] !== undefined) meta.customCss = validatePath('custom_css');
  if (parsed['custom_js'] !== undefined) meta.customJs = validatePath('custom_js');
  if (parsed['logo'] !== undefined) meta.logo = validatePath('logo');

  return { meta, hero, body, warnings: [] };
}
