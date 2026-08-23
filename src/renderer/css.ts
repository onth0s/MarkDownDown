/**
 * Parameterized CSS module.
 * Returns the complete stylesheet as a string, with the accent color
 * and luminosity parameters substituted in.
 */
import { loadTemplate, substituteTokens } from '../util/template-loader.js';
import type { BgLum } from '../types.js';
import { lerpColor, getContrastFg } from '../util/color.js';

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
  const accentFg = getContrastFg(accent);

  return substituteTokens(loadTemplate('style.css'), {
    __ACCENT__: accent,
    __ACCENT_RGB__: accentRgb,
    __ACCENT_FG__: accentFg,
    __BASE_DARK_BG__: p.darkBg,
    __BASE_DARK_SURFACE__: p.darkSurface,
    __BASE_DARK_SURFACE2__: p.darkSurface2,
    __BASE_DARK_SURFACE3__: p.darkSurface3,
    __BASE_DARK_CODE__: p.darkCode,
    __BASE_LIGHT_BG__: p.lightBg,
    __BASE_LIGHT_SURFACE__: p.lightSurface,
    __BASE_LIGHT_SURFACE2__: p.lightSurface2,
    __BASE_LIGHT_SURFACE3__: p.lightSurface3,
    __BASE_LIGHT_CODE__: p.lightCode,
    __DARK_BG_MIX__: `${p.darkBgMixPct}%`,
    __DARK_BG_TINT__: `${p.darkTintPct}%`,
    __DARK_SURF_MIX__: `${p.darkSurfaceMixPct}%`,
    __DARK_SURF_TINT__: `${p.darkSurfaceTintPct}%`,
    __LIGHT_BG_MIX__: `${p.lightBgMixPct}%`,
    __LIGHT_BG_TINT__: `${p.lightTintPct}%`,
    __LIGHT_SURF_MIX__: `${p.lightSurfaceMixPct}%`,
    __LIGHT_SURF_TINT__: `${p.lightSurfaceTintPct}%`,
  });
}
