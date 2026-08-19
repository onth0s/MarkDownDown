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
  // Dark mode:
  // lum 0.0 -> #000000 / #050505 (pure pitch OLED black, 0% accent wash)
  // lum 1.0 -> #22272e / #2d333b (soft charcoal)
  const darkVal = bgLum?.dark ?? 0.08;
  const darkBg = lerpColor('#000000', '#2d333b', darkVal);
  const darkSurface = lerpColor('#030303', '#373e47', darkVal);
  const darkSurface2 = lerpColor('#080808', '#424b57', darkVal);
  const darkSurface3 = lerpColor('#0e0e0e', '#4c5664', darkVal);
  const darkCode = lerpColor('#020202', '#2d333b', darkVal);
  const darkTintPct = Math.round(darkVal * 8); // at 0.0 -> 0% accent tint!

  // Light mode:
  // lum 0.0 -> #dce4ec / #e9eff6 (soft warm grey)
  // lum 1.0 -> #ffffff / #ffffff (crisp pure white, 0% accent wash)
  const lightVal = bgLum?.light ?? 0.96;
  const lightBg = lerpColor('#dce4ec', '#ffffff', lightVal);
  const lightSurface = lerpColor('#e9eff6', '#ffffff', lightVal);
  const lightSurface2 = lerpColor('#e2e8f0', '#f4f6f9', lightVal);
  const lightSurface3 = lerpColor('#d7dfe8', '#e9eef5', lightVal);
  const lightCode = lerpColor('#e2e8f0', '#f8fafc', lightVal);
  const lightTintPct = Math.round((1 - lightVal) * 15);

  const darkBgMixPct = 100 - darkTintPct;
  const darkSurfaceMixPct = 100 - Math.min(20, Math.round(darkVal * 10));
  const lightBgMixPct = 100 - lightTintPct;
  const lightSurfaceMixPct = 100 - Math.min(15, Math.round((1 - lightVal) * 12));

  return loadTemplate('style.css')
    .replace(/__ACCENT__/g, accent)
    .replace(/__ACCENT_RGB__/g, accentRgb)
    .replace(/__BASE_DARK_BG__/g, darkBg)
    .replace(/__BASE_DARK_SURFACE__/g, darkSurface)
    .replace(/__BASE_DARK_SURFACE2__/g, darkSurface2)
    .replace(/__BASE_DARK_SURFACE3__/g, darkSurface3)
    .replace(/__BASE_DARK_CODE__/g, darkCode)
    .replace(/__BASE_LIGHT_BG__/g, lightBg)
    .replace(/__BASE_LIGHT_SURFACE__/g, lightSurface)
    .replace(/__BASE_LIGHT_SURFACE2__/g, lightSurface2)
    .replace(/__BASE_LIGHT_SURFACE3__/g, lightSurface3)
    .replace(/__BASE_LIGHT_CODE__/g, lightCode)
    .replace(/__DARK_BG_MIX__/g, `${darkBgMixPct}%`)
    .replace(/__DARK_BG_TINT__/g, `${darkTintPct}%`)
    .replace(/__DARK_SURF_MIX__/g, `${darkSurfaceMixPct}%`)
    .replace(/__DARK_SURF_TINT__/g, `${100 - darkSurfaceMixPct}%`)
    .replace(/__LIGHT_BG_MIX__/g, `${lightBgMixPct}%`)
    .replace(/__LIGHT_BG_TINT__/g, `${lightTintPct}%`)
    .replace(/__LIGHT_SURF_MIX__/g, `${lightSurfaceMixPct}%`)
    .replace(/__LIGHT_SURF_TINT__/g, `${100 - lightSurfaceMixPct}%`);
}
