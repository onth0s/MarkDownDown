/**
 * Parameterized CSS module.
 * Returns the complete stylesheet as a string, with the accent color
 * and luminosity parameters substituted in.
 */
import { loadTemplate } from '../util/template-loader.js';
import type { BgLum } from '../types.js';

function lerpColor(hexA: string, hexB: string, t: number): string {
  const parse = (h: string) => {
    const clean = h.replace('#', '');
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  };
  const [r1, g1, b1] = parse(hexA);
  const [r2, g2, b2] = parse(hexB);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function buildCss(accent: string, accentRgb: string, bgLum?: BgLum): string {
  // Dark mode: default base is ~0.08 luminosity (#0b0f16 / #111827)
  // lum 0.0 -> #000000 / #09090b (pure pitch black)
  // lum 1.0 -> #22272e / #2d333b (soft charcoal)
  const darkVal = bgLum?.dark ?? 0.08;
  const darkBg = lerpColor('#000000', '#2d333b', darkVal);
  const darkSurface = lerpColor('#0a0e17', '#373e47', darkVal);

  // Light mode: default base is ~0.96 luminosity (#f4f7fb / #ffffff)
  // lum 0.0 -> #e2e8f0 / #edf2f7 (soft warm grey)
  // lum 1.0 -> #f8fafc / #ffffff (crisp pure white)
  const lightVal = bgLum?.light ?? 0.96;
  const lightBg = lerpColor('#dce4ec', '#f8fafc', lightVal);
  const lightSurface = lerpColor('#e9eff6', '#ffffff', lightVal);

  return loadTemplate('style.css')
    .replace(/__ACCENT__/g, accent)
    .replace(/__ACCENT_RGB__/g, accentRgb)
    .replace(/__BASE_DARK_BG__/g, darkBg)
    .replace(/__BASE_DARK_SURFACE__/g, darkSurface)
    .replace(/__BASE_LIGHT_BG__/g, lightBg)
    .replace(/__BASE_LIGHT_SURFACE__/g, lightSurface);
}
