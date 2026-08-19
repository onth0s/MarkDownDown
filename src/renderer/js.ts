/**
 * Parameterized interactive JavaScript module.
 *
 * Returns the client-side JS with accent color and favicon substituted in.
 */
import { loadTemplate } from '../util/template-loader.js';
import { DEFAULT_FAVICON_TEMPLATE } from './logo.js';

export function buildJs(
  accent: string,
  routes: Record<string, string> = {},
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
): string {
  return loadTemplate('app.js')
    .replace(/__ACCENT__/g, accent)
    .replace(/'__FAVICON__'/g, () => JSON.stringify(faviconTemplate))
    .replace(/__ROUTES__/g, () => JSON.stringify(routes))
    .replace(/__BASE_DARK_BG__/g, darkBg)
    .replace(/__BASE_DARK_SURFACE__/g, darkSurface)
    .replace(/__DARK_BG_MIX__/g, darkBgMix)
    .replace(/__DARK_BG_TINT__/g, darkBgTint)
    .replace(/__DARK_SURF_MIX__/g, darkSurfMix)
    .replace(/__DARK_SURF_TINT__/g, darkSurfTint)
    .replace(/__BASE_LIGHT_BG__/g, lightBg)
    .replace(/__BASE_LIGHT_SURFACE__/g, lightSurface)
    .replace(/__LIGHT_BG_MIX__/g, lightBgMix)
    .replace(/__LIGHT_BG_TINT__/g, lightBgTint)
    .replace(/__LIGHT_SURF_MIX__/g, lightSurfMix)
    .replace(/__LIGHT_SURF_TINT__/g, lightSurfTint);
}
