/**
 * Parameterized CSS module.
 * Returns the complete stylesheet as a string, with the accent color
 * substituted in.
 */
import { loadTemplate } from '../util/template-loader.js';

export function buildCss(accent: string, accentRgb: string): string {
  return loadTemplate('style.css')
    .replace(/__ACCENT__/g, accent)
    .replace(/__ACCENT_RGB__/g, accentRgb);
}
