/**
 * Parameterized interactive JavaScript module.
 *
 * Returns the client-side JS with accent color and favicon substituted in.
 */
import { loadTemplate, substituteTokens } from '../util/template-loader.js';
import { DEFAULT_FAVICON_TEMPLATE } from './logo.js';

export interface BuildJsOptions {
  accent: string;
  routes?: Record<string, string>;
  faviconTemplate?: string;
  darkBg?: string;
  darkSurface?: string;
  darkBgMix?: string;
  darkBgTint?: string;
  darkSurfMix?: string;
  darkSurfTint?: string;
  lightBg?: string;
  lightSurface?: string;
  lightBgMix?: string;
  lightBgTint?: string;
  lightSurfMix?: string;
  lightSurfTint?: string;
  theme?: string;
}

export function buildJs(accentOrOpts: string | BuildJsOptions): string {
  const opts = typeof accentOrOpts === 'string' ? { accent: accentOrOpts } : accentOrOpts;
  const {
    accent,
    routes = {},
    faviconTemplate = DEFAULT_FAVICON_TEMPLATE,
    darkBg = '#0b0f16',
    darkSurface = '#111827',
    darkBgMix = '92%',
    darkBgTint = '8%',
    darkSurfMix = '90%',
    darkSurfTint = '10%',
    lightBg = '#f4f7fb',
    lightSurface = '#ffffff',
    lightBgMix = '94%',
    lightBgTint = '6%',
    lightSurfMix = '95%',
    lightSurfTint = '5%',
    theme = 'dark',
  } = opts;

  return substituteTokens(loadTemplate('app.js'), {
    __ACCENT__: accent,
    "'__THEME__'": () => JSON.stringify(theme),
    "'__FAVICON__'": () => JSON.stringify(faviconTemplate),
    __ROUTES__: () => JSON.stringify(routes),
    __BASE_DARK_BG__: darkBg,
    __BASE_DARK_SURFACE__: darkSurface,
    __DARK_BG_MIX__: darkBgMix,
    __DARK_BG_TINT__: darkBgTint,
    __DARK_SURF_MIX__: darkSurfMix,
    __DARK_SURF_TINT__: darkSurfTint,
    __BASE_LIGHT_BG__: lightBg,
    __BASE_LIGHT_SURFACE__: lightSurface,
    __LIGHT_BG_MIX__: lightBgMix,
    __LIGHT_BG_TINT__: lightBgTint,
    __LIGHT_SURF_MIX__: lightSurfMix,
    __LIGHT_SURF_TINT__: lightSurfTint,
  });
}
