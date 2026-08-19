/**
 * Frontmatter parser.
 * Extracts YAML frontmatter delimited by --- fences and parses it
 * into a partial Options object. Returns both the parsed options and
 * the remaining markdown body.
 */
import yaml from 'js-yaml';
import path from 'node:path';
import type { Options, HeroMeta, BgLum } from '../types.js';
import { toErrorMessage } from '../util/error.js';

export interface FrontmatterResult {
  /** Parsed option overrides from frontmatter */
  meta: Partial<Pick<Options, 'title' | 'author' | 'assetsDir' | 'accent' | 'customCss' | 'customJs' | 'logo' | 'bgLum'>>;
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

  let parsed: Record<string, unknown> = {};
  try {
    const result = yaml.load(rawYaml);
    if (result && typeof result === 'object') {
      parsed = result as Record<string, unknown>;
    }
  } catch (err) {
    return { meta: {}, hero: {}, body: source, warnings: [`Invalid YAML frontmatter: ${toErrorMessage(err)}`] };
  }

  const meta: FrontmatterResult['meta'] = {};
  const hero: HeroMeta = {};

  if (typeof parsed['title'] === 'string') meta.title = parsed['title'];
  if (typeof parsed['author'] === 'string') meta.author = parsed['author'];
  if (typeof parsed['accent'] === 'string') meta.accent = parsed['accent'];

  const rawBgLum = parsed['bg_lum'] ?? parsed['bg-lum'] ?? parsed['bglum'];
  if (rawBgLum !== undefined) {
    const parsedLum = parseBgLum(rawBgLum);
    if (parsedLum) meta.bgLum = parsedLum;
  }

  if (typeof parsed['kicker'] === 'string') hero.kicker = parsed['kicker'];
  if (typeof parsed['subtitle'] === 'string') hero.subtitle = parsed['subtitle'];
  if (Array.isArray(parsed['pills']) && parsed['pills'].every((p: unknown) => typeof p === 'string')) {
    hero.pills = parsed['pills'] as string[];
  }

  if (typeof parsed['assets_dir'] === 'string') {
    meta.assetsDir = path.resolve(inputDir, parsed['assets_dir']);
  }
  if (typeof parsed['custom_css'] === 'string') {
    meta.customCss = path.resolve(inputDir, parsed['custom_css']);
  }
  if (typeof parsed['custom_js'] === 'string') {
    meta.customJs = path.resolve(inputDir, parsed['custom_js']);
  }
  if (typeof parsed['logo'] === 'string') {
    meta.logo = path.resolve(inputDir, parsed['logo']);
  }

  return { meta, hero, body, warnings: [] };
}
