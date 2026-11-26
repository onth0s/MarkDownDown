/**
 * Brand logo and favicon processor for Markdown++.
 * Handles default SVG logo, custom SVG recoloring, and raster image logos.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ProcessedLogo } from '../types.js';
import { LOGO } from '../constants.js';
import { darkenHex, getContrastFg, parseAnyColor, hexToHsl, hslToHex } from '../util/color.js';
import { escHtml } from '../util/escape.js';
import { getMime } from '../util/mime.js';

const VIEWBOX_RE = /^-?\d+(?:\.\d+)?(?:\s+-?\d+(?:\.\d+)?){3}$/;

function sanitizeSvgContent(svg: string): string {
  return svg
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(?:xlink:)?href\s*=\s*(?:"\s*(?:javascript|vbscript|data:text\/html)[^"]*"|'\s*(?:javascript|vbscript|data:text\/html)[^']*')/gi, '');
}

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
      .replace(/\{accent\}/g, () => accent)
      .replace(/\{accentDark\}/g, () => darkAccent)
      .replace(/\{accentFg\}/g, () => fgAccent);

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
    let viewBox = viewBoxMatch ? viewBoxMatch[1].trim() : '';

    if (!viewBox || !VIEWBOX_RE.test(viewBox)) {
      const wMatch = rawSvg.match(/width=["'](\d+(?:\.\d+)?)["']/i);
      const hMatch = rawSvg.match(/height=["'](\d+(?:\.\d+)?)["']/i);
      if (wMatch && hMatch) {
        viewBox = `0 0 ${wMatch[1]} ${hMatch[1]}`;
      } else {
        viewBox = '0 0 1024 1024';
      }
    }

    // Extract inner content of the SVG tag, sanitize, and flatten whitespace/newlines
    const innerContentMatch = rawSvg.match(/<svg[^>]*>([\s\S]*?)<\/svg>/i);
    const innerContent = sanitizeSvgContent(innerContentMatch ? innerContentMatch[1] : rawSvg)
      .replace(/\r?\n|\r/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const [targetH, targetS, targetL] = hexToHsl(accent);

    const attrColorRegex = /(fill|stroke|stop-color)\s*=\s*["']([^"']+)["']/gi;
    const stylePropRegex = /(fill|stroke|stop-color)\s*:\s*([^;"']+)/gi;

    // Lightness window in which a colour keeps its own tone. Outside it a colour
    // is an extreme -- a white knockout, a black shadow -- whose only job is to
    // contrast with the shapes it sits on.
    const MID_LO = LOGO.MID_LO;
    const MID_HI = LOGO.MID_HI;
    const KNOCKOUT_L = LOGO.KNOCKOUT_L;
    const SHADOW_L = LOGO.SHADOW_L;

    const sourceTones = new Set<number>();
    for (const m of innerContent.matchAll(attrColorRegex)) {
      const parsed = parseAnyColor(m[2]);
      if (parsed) sourceTones.add(parsed[2]);
    }
    for (const m of innerContent.matchAll(stylePropRegex)) {
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

    const recolorSvg = (src: string, dynamic: boolean): string => {
      let out = src.replace(/style\s*=\s*(["'])([\s\S]*?)\1/gi, (_m, q: string, styleBody: string) => {
        const replaced = styleBody.replace(stylePropRegex, (sm, prop: string, color: string) => {
          const res = transformColor(color);
          if (!res) return sm;
          return dynamic ? `${prop}:${`{L_${res.lightness}}`}` : `${prop}:${res.recoloredHex}`;
        });
        return `style=${q}${replaced}${q}`;
      });
      out = out.replace(attrColorRegex, (match, prop: string, color: string) => {
        const res = transformColor(color);
        if (!res) return match;
        return dynamic
          ? `${prop}="{L_${res.lightness}}"`
          : `${prop}="${res.recoloredHex}" data-l="${res.lightness}"`;
      });
      return out;
    };

    // Static recolored content for compile-time navbar
    const staticRecolored = recolorSvg(innerContent, false);

    // Dynamic template for runtime favicon (placeholders {L_xx})
    const dynamicTemplateContent = recolorSvg(innerContent, true);

    const safeViewBox = escHtml(viewBox);
    const navbarLogo =
      `<svg class="brand-logo" aria-hidden="true" focusable="false" ` +
      `width="34.5" height="34.5" viewBox="${safeViewBox}" ` +
      `fill="none" xmlns="http://www.w3.org/2000/svg">` +
      staticRecolored +
      `</svg>`;

    // Favicon template from normalized SVG (single line, safe for JS string embedding)
    const faviconTemplate =
      `<svg viewBox="${safeViewBox}" width="64" height="64" ` +
      `fill="none" xmlns="http://www.w3.org/2000/svg">` +
      dynamicTemplateContent +
      `</svg>`;

    const faviconSvg =
      `<svg viewBox="${safeViewBox}" width="64" height="64" ` +
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

/**
 * Auto-detect a single logo SVG in cwd or inputDir when `-L` is passed without an argument.
 */
export function resolveCliLogoPath(
  logoOpt: string | boolean | undefined,
  inputDir: string
): { logoPath?: string; error?: string } {
  if (typeof logoOpt === 'string') {
    return { logoPath: path.resolve(process.cwd(), logoOpt) };
  }
  if (logoOpt === true) {
    const findSingleSvg = (dir: string): string | null => {
      try {
        const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.svg'));
        if (files.length === 1) return path.join(dir, files[0]);
      } catch {
        // ignore
      }
      return null;
    };
    const cwdSvg = findSingleSvg(process.cwd());
    const inputDirSvg = findSingleSvg(inputDir);
    if (cwdSvg) return { logoPath: cwdSvg };
    if (inputDirSvg) return { logoPath: inputDirSvg };

    try {
      const cwdSvgs = fs.readdirSync(process.cwd()).filter(f => f.toLowerCase().endsWith('.svg'));
      if (cwdSvgs.length > 1) {
        return { error: 'Multiple .svg files found in working directory. Please specify path: -L <path>' };
      }
    } catch {
      // ignore
    }
    return { error: '-L flag passed with no argument, but no .svg file was found in working directory or input directory.' };
  }
  return {};
}
