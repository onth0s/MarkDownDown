import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_LOGO_PATHS, DEFAULT_FAVICON_TEMPLATE } from './logo.js';
import { darkenHex, rgbToHsl, hexToHsl, hslToHex } from '../util/color.js';
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
    const defaultNavLogo =
      `<svg class="brand-logo" aria-hidden="true" focusable="false" ` +
      `width="30" height="30" viewBox="0 0 1024 1024" ` +
      `fill="none" xmlns="http://www.w3.org/2000/svg">` +
      DEFAULT_LOGO_PATHS +
      `</svg>`;

    const faviconSvg = DEFAULT_FAVICON_TEMPLATE
      .replace(/\{accent\}/g, accent)
      .replace(/\{accentDark\}/g, darkAccent);

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

    // Map all non-transparent hex / rgb colors to accent hue + saturation with preserved lightness
    // Match colors in fill="...", stroke="...", style="fill:...", style="stroke:..."
    const colorRegex = /(fill|stroke|stop-color)\s*[:=]\s*["']?((?:#(?:[0-9a-fA-F]{3}){1,2})|(?:rgb\s*\([^)]+\)))["']?/gi;

    // Helper to transform any color string
    const transformColor = (colorStr: string): { recoloredHex: string; lightness: number } => {
      const hex = colorStr.trim();
      if (hex.startsWith('rgb')) {
        const nums = hex.match(/\d+/g);
        if (nums && nums.length >= 3) {
          const r = parseInt(nums[0], 10);
          const g = parseInt(nums[1], 10);
          const b = parseInt(nums[2], 10);
          const [, , l] = rgbToHsl(r, g, b);
          const [targetH, targetS] = hexToHsl(accent);
          return { recoloredHex: hslToHex(targetH, targetS, l), lightness: l };
        }
      }
      const [, , l] = hexToHsl(hex);
      const [targetH, targetS] = hexToHsl(accent);
      return { recoloredHex: hslToHex(targetH, targetS, l), lightness: l };
    };

    // Static recolored content for compile-time navbar
    const staticRecolored = innerContent.replace(colorRegex, (match, prop, color) => {
      const lower = color.toLowerCase().trim();
      if (lower === 'none' || lower === 'transparent') return match;
      const { recoloredHex, lightness } = transformColor(color);
      return `${prop}="${recoloredHex}" data-l="${lightness}"`;
    });

    // Dynamic template for runtime favicon (placeholders {L_xx})
    const dynamicTemplateContent = innerContent.replace(colorRegex, (match, prop, color) => {
      const lower = color.toLowerCase().trim();
      if (lower === 'none' || lower === 'transparent') return match;
      const { lightness } = transformColor(color);
      return `${prop}="{L_${lightness}}"`;
    });

    const navbarLogo =
      `<svg class="brand-logo" aria-hidden="true" focusable="false" ` +
      `width="30" height="30" viewBox="${viewBox}" ` +
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
