/**
 * Parameterized CSS module.
 * Returns the complete stylesheet as a string, with the accent color
 * substituted in. The CSS is extracted to templates/style.css and
 * parameterized on `accent` (hex string, e.g. '#3b82f6') and
 * `accentRgb` (e.g. '59,130,246').
 */
import fs from 'node:fs';
import path from 'node:path';

let cachedCss: string | null = null;

function loadCssTemplate(): string {
  if (cachedCss !== null) return cachedCss;
  const candidates = [
    path.resolve(process.cwd(), 'templates/style.css'),
    path.resolve(process.cwd(), 'src/templates/style.css'),
    path.resolve(process.cwd(), '../templates/style.css'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        cachedCss = fs.readFileSync(p, 'utf8');
        return cachedCss;
      }
    } catch { /* continue */ }
  }
  throw new Error('templates/style.css not found');
}

export function buildCss(accent: string, accentRgb: string): string {
  return loadCssTemplate()
    .replace(/__ACCENT__/g, accent)
    .replace(/__ACCENT_RGB__/g, accentRgb);
}
