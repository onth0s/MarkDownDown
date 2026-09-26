/**
 * Brand logo and favicon processor for Markdown++.
 * Handles default SVG logo, custom SVG recoloring, and raster image logos.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ProcessedLogo } from '../types.js';
import { darkenHex, getContrastFg, parseAnyColor, hexToHsl, hslToHex } from '../util/color.js';
import { getMime } from '../util/mime.js';

export type { ProcessedLogo };

/** Path / shape definition for the inline navbar SVG. */
export const DEFAULT_LOGO_PATHS: string =
  `<rect x="64" y="64" width="896" height="896" rx="220" fill="var(--accent)"/>` +
  `<text x="512" y="580" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="280" letter-spacing="-0.04em" fill="var(--accent-fg)">MDD</text>`;

/** Favicon SVG template with {accent}, {accentDark}, and {accentFg} placeholders. */
export const DEFAULT_FAVICON_TEMPLATE: string =
  `<svg viewBox="0 0 1024 1024" width="64" height="64" fill="none" xmlns="http://www.w3.org/2000/svg">` +
  `<rect x="64" y="64" width="896" height="896" rx="220" fill="{accent}"/>` +
  `<text x="512" y="580" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="280" letter-spacing="-0.04em" fill="{accentFg}">MDD</text>` +
  `</svg>`;

/**
 * Process custom logo file (SVG or image) or fall back to default logo.
 */
export function processLogo(logoPath?: string, accent = '#3b82f6', warnings?: string[]): ProcessedLogo {
  const darkAccent = darkenHex(accent);

  if (!logoPath || !fs.existsSync(logoPath)) {
    if (logoPath && !fs.existsSync(logoPath) && warnings) {
      warnings.push(`Logo file not found: "${logoPath}" (falling back to default logo)`);
    }
    const fgAccent = getContrastFg(accent);
    const defaultNavLogo =
      `<svg class="brand-logo" aria-hidden="true" focusable="false" ` +
      `width="34.5" height="34.5" viewBox="0 0 1024 1024" ` +
      `fill="none" xmlns="http://www.w3.org/2000/svg">` +
      DEFAULT_LOGO_PATHS +
      `</svg>`;

    const faviconSvg = DEFAULT_FAVICON_TEMPLATE
      .replace(/\{accent\}/g, accent)
      .replace(/\{accentDark\}/g, darkAccent)
      .replace(/\{accentFg\}/g, fgAccent);

    return {
      navbarLogo: defaultNavLogo,
      faviconTemplate: DEFAULT_FAVICON_TEMPLATE,
      faviconHref: 'data:image/svg+xml,' + encodeURIComponent(faviconSvg),
    };
  }

  const ext = path.extname(logoPath).toLowerCase();

  // SVG Logo
  if (ext === '.svg') {
    const rawSvg = fs.readFileSync(logoPath, 'utf8').trim();

    // Extract viewBox or calculate from width / height attributes
    const viewBoxMatch = rawSvg.match(/viewBox=["']([^"']+)["']/i);
    let viewBox = viewBoxMatch ? viewBoxMatch[1] : '';

    if (!viewBox) {
      const wMatch = rawSvg.match(/width=["'](\d+(?:\.\d+)?)["']/i);
      const hMatch = rawSvg.match(/height=["'](\d+(?:\.\d+)?)["']/i);
      if (wMatch && hMatch) {
        viewBox = `0 0 ${wMatch[1]} ${hMatch[1]}`;
      } else {
        viewBox = '0 0 1024 1024';
      }
    }

    // Extract inner content of the SVG tag and flatten whitespace/newlines
    const innerContentMatch = rawSvg.match(/<svg[^>]*>([\s\S]*?)<\/svg>/i);
    const innerContent = (innerContentMatch ? innerContentMatch[1] : rawSvg)
      .replace(/\r?\n|\r/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const [targetH, targetS, targetL] = hexToHsl(accent);

    // Regex matching fill="...", stroke="...", stop-color="...", and style="..." declarations
    const colorRegex = /(fill|stroke|stop-color)\s*[:=]\s*["']?([^"';>]+)["']?/gi;

    // Lightness window in which a colour keeps its own tone. Outside it a colour
    // is an extreme -- a white knockout, a black shadow -- whose only job is to
    // contrast with the shapes it sits on.
    const MID_LO = 15;
    const MID_HI = 85;
    const KNOCKOUT_L = 97;
    const SHADOW_L = 3;

    // Resolve the logo's whole tone set before recolouring any single colour.
    // Judged per element, an extreme snapped onto the accent's own lightness --
    // which is exactly where a mid-tone shape had already landed, because
    // mid-tones keep their relative lightness. The two collapse to one hex and
    // the knockout text disappears into the shape behind it. Only artwork that
    // genuinely carries more than one tone is treated as multi-tone, so
    // single-tone logos keep snapping wholesale to the accent.
    const sourceTones = new Set<number>();
    for (const m of innerContent.matchAll(colorRegex)) {
      const parsed = parseAnyColor(m[2]);
      if (parsed) sourceTones.add(parsed[2]);
    }
    const multiTone = sourceTones.size > 1;

    // Mirrored verbatim in templates/app/01-core.js (resolveLogoLightness); the
    // two must stay identical or a runtime accent change re-collides the tones.
    const resolveLogoLightness = (l: number): number => {
      if (l > MID_LO && l < MID_HI) return l;
      if (!multiTone) return targetL;
      return l >= MID_HI ? KNOCKOUT_L : SHADOW_L;
    };

    // Helper to transform any color string
    const transformColor = (colorStr: string): { recoloredHex: string; lightness: number } | null => {
      const hsl = parseAnyColor(colorStr);
      if (!hsl) return null;
      const effectiveL = resolveLogoLightness(hsl[2]);

      return {
        recoloredHex: hslToHex(targetH, targetS, effectiveL),
        lightness: effectiveL,
      };
    };

    // Static recolored content for compile-time navbar
    const staticRecolored = innerContent.replace(colorRegex, (match, prop, color) => {
      const res = transformColor(color);
      if (!res) return match;
      return `${prop}="${res.recoloredHex}" data-l="${res.lightness}"`;
    });

    // Dynamic template for runtime favicon (placeholders {L_xx})
    const dynamicTemplateContent = innerContent.replace(colorRegex, (match, prop, color) => {
      const res = transformColor(color);
      if (!res) return match;
      return `${prop}="{L_${res.lightness}}"`;
    });

    const navbarLogo =
      `<svg class="brand-logo" aria-hidden="true" focusable="false" ` +
      `width="34.5" height="34.5" viewBox="${viewBox}" ` +
      `fill="none" xmlns="http://www.w3.org/2000/svg">` +
      staticRecolored +
      `</svg>`;

    // Favicon template from normalized SVG (single line, safe for JS string embedding)
    const faviconTemplate =
      `<svg viewBox="${viewBox}" width="64" height="64" ` +
      `fill="none" xmlns="http://www.w3.org/2000/svg">` +
      dynamicTemplateContent +
      `</svg>`;

    const faviconSvg =
      `<svg viewBox="${viewBox}" width="64" height="64" ` +
      `fill="none" xmlns="http://www.w3.org/2000/svg">` +
      staticRecolored +
      `</svg>`;

    return {
      navbarLogo,
      faviconTemplate,
      faviconHref: 'data:image/svg+xml,' + encodeURIComponent(faviconSvg),
    };
  }

  // Raster Image Logo (PNG, JPG, WebP, GIF, etc.)
  const data = fs.readFileSync(logoPath);
  const mime = getMime(ext.slice(1)) || 'image/png';
  const dataUri = `data:${mime};base64,${data.toString('base64')}`;

  const navbarLogo = `<img class="brand-logo" src="${dataUri}" width="30" height="30" alt="Logo">`;

  return {
    navbarLogo,
    faviconTemplate: dataUri,
    faviconHref: dataUri,
  };
}
