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

export interface LuminosityParams {
  darkBg: string;
  darkSurface: string;
  darkSurface2: string;
  darkSurface3: string;
  darkCode: string;
  darkBgMixPct: number;
  darkTintPct: number;
  darkSurfaceMixPct: number;
  darkSurfaceTintPct: number;
  lightBg: string;
  lightSurface: string;
  lightSurface2: string;
  lightSurface3: string;
  lightCode: string;
  lightBgMixPct: number;
  lightTintPct: number;
  lightSurfaceMixPct: number;
  lightSurfaceTintPct: number;
}

export function computeLuminosityParams(bgLum?: BgLum): LuminosityParams {
  const darkVal = bgLum?.dark ?? 0.08;
  const darkBg = lerpColor('#000000', '#0b0f16', darkVal === 0 ? 0 : Math.min(1, darkVal / 0.08));
  const darkSurface = lerpColor('#030303', '#111827', darkVal === 0 ? 0 : Math.min(1, darkVal / 0.08));
  const darkSurface2 = lerpColor('#080808', '#172033', darkVal === 0 ? 0 : Math.min(1, darkVal / 0.08));
  const darkSurface3 = lerpColor('#0e0e0e', '#1d293d', darkVal === 0 ? 0 : Math.min(1, darkVal / 0.08));
  const darkCode = lerpColor('#020202', '#0a0e15', darkVal === 0 ? 0 : Math.min(1, darkVal / 0.08));
  const darkTintPct = bgLum ? Math.round(darkVal * 100) : 8;

  const lightVal = bgLum?.light ?? 0.96;
  const lightBg = lerpColor('#dce4ec', '#f4f7fb', lightVal);
  const lightSurface = lerpColor('#e9eff6', '#ffffff', lightVal);
  const lightSurface2 = lerpColor('#e2e8f0', '#f0f4f9', lightVal);
  const lightSurface3 = lerpColor('#d7dfe8', '#e6edf6', lightVal);
  const lightCode = lerpColor('#e2e8f0', '#eef2f8', lightVal);
  const lightTintPct = bgLum ? Math.round((1 - lightVal) * 100) : 6;

  const darkBgMixPct = 100 - darkTintPct;
  const darkSurfaceMixPct = bgLum ? (100 - Math.min(20, Math.round(darkVal * 100))) : 90;
  const lightBgMixPct = 100 - lightTintPct;
  const lightSurfaceMixPct = bgLum ? (100 - Math.min(15, Math.round((1 - lightVal) * 100))) : 95;

  return {
    darkBg,
    darkSurface,
    darkSurface2,
    darkSurface3,
    darkCode,
    darkBgMixPct,
    darkTintPct,
    darkSurfaceMixPct,
    darkSurfaceTintPct: 100 - darkSurfaceMixPct,
    lightBg,
    lightSurface,
    lightSurface2,
    lightSurface3,
    lightCode,
    lightBgMixPct,
    lightTintPct,
    lightSurfaceMixPct,
    lightSurfaceTintPct: 100 - lightSurfaceMixPct,
  };
}

export function buildCss(accent: string, accentRgb: string, bgLum?: BgLum): string {
  const p = computeLuminosityParams(bgLum);

  return loadTemplate('style.css')
    .replace(/__ACCENT__/g, accent)
    .replace(/__ACCENT_RGB__/g, accentRgb)
    .replace(/__BASE_DARK_BG__/g, p.darkBg)
    .replace(/__BASE_DARK_SURFACE__/g, p.darkSurface)
    .replace(/__BASE_DARK_SURFACE2__/g, p.darkSurface2)
    .replace(/__BASE_DARK_SURFACE3__/g, p.darkSurface3)
    .replace(/__BASE_DARK_CODE__/g, p.darkCode)
    .replace(/__BASE_LIGHT_BG__/g, p.lightBg)
    .replace(/__BASE_LIGHT_SURFACE__/g, p.lightSurface)
    .replace(/__BASE_LIGHT_SURFACE2__/g, p.lightSurface2)
    .replace(/__BASE_LIGHT_SURFACE3__/g, p.lightSurface3)
    .replace(/__BASE_LIGHT_CODE__/g, p.lightCode)
    .replace(/__DARK_BG_MIX__/g, `${p.darkBgMixPct}%`)
    .replace(/__DARK_BG_TINT__/g, `${p.darkTintPct}%`)
    .replace(/__DARK_SURF_MIX__/g, `${p.darkSurfaceMixPct}%`)
    .replace(/__DARK_SURF_TINT__/g, `${p.darkSurfaceTintPct}%`)
    .replace(/__LIGHT_BG_MIX__/g, `${p.lightBgMixPct}%`)
    .replace(/__LIGHT_BG_TINT__/g, `${p.lightTintPct}%`)
    .replace(/__LIGHT_SURF_MIX__/g, `${p.lightSurfaceMixPct}%`)
    .replace(/__LIGHT_SURF_TINT__/g, `${p.lightSurfaceTintPct}%`);
}
