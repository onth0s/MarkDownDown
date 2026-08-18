/**
 * Parameterized interactive JavaScript module.
 *
 * Returns the client-side JS with accent color and favicon substituted in.
 */
import { loadTemplate } from '../util/template-loader.js';
import { CLDS_FAVICON_TEMPLATE } from './logo.js';

export function buildJs(accent: string, routes: Record<string, string> = {}): string {
  return loadTemplate('app.js')
    .replace(/__ACCENT__/g, accent)
    .replace(/__FAVICON__/g, CLDS_FAVICON_TEMPLATE)
    .replace(/__ROUTES__/g, () => JSON.stringify(routes));
}
