import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_LOGO_PATHS, DEFAULT_FAVICON_TEMPLATE } from './logo.js';
import { darkenHex, getContrastFg, parseAnyColor, hexToHsl, hslToHex } from '../util/color.js';
import { getMime } from '../util/mime.js';

export interface ProcessedLogo {
  /** The HTML/SVG markup to insert into the topbar navbar */
  navbarLogo: string;
  /** The SVG template string (with {accent} and {accentDark} placeholders) or data URI */
  faviconTemplate: string;
  /** Initial favicon href data URI */
  faviconHref: string;
}

/**
 * Process custom logo file (SVG or image) or fall back to default logo.
 */
export function processLogo(logoPath?: string, accent = '#3b82f6'): ProcessedLogo {
  const darkAccent = darkenHex(accent);

  if (!logoPath || !fs.existsSync(logoPath)) {
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

    // Helper to transform any color string
    const transformColor = (colorStr: string): { recoloredHex: string; lightness: number } | null => {
      const hsl = parseAnyColor(colorStr);
      if (!hsl) return null;
      const [, , l] = hsl;
      
      // Determine effective lightness:
      // If the source element is monochromatic black / very dark (L <= 15),
      // map it to the target accent's lightness.
      let effectiveL = l <= 15 ? targetL : l;

      // If the target accent is pure white (L >= 95) or pure black (L <= 5),
      // ensure elements reflect the intended white/black accent luminosity:
      if (targetL >= 95) {
        // White accent -> use bright white tone (L = 90%)
        effectiveL = 90;
      } else if (targetL <= 5) {
        // Black accent -> use deep dark tone (L = 15%)
        effectiveL = 15;
      }

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
