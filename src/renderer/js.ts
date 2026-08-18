/**
 * Parameterized interactive JavaScript module.
 *
 * Extracted from CLDS_interactive_v15.html lines 2423–3674, with client-side
 * diagram/table *rendering* logic stripped (those are pre-rendered at compile
 * time). Retains: TOC generation, scroll spy, full-text search, theme
 * switching, accent picker, copy buttons, mobile nav, diagram/table SVG
 * interactivity (highlight sync), and keyboard shortcuts.
 *
 * The `accent` parameter seeds the initial accent color (used as the fallback
 * if no user preference is stored in localStorage).
 */
import fs from 'node:fs';
import path from 'node:path';
import { CLDS_FAVICON_TEMPLATE } from './logo.js';

let cachedJs: string | null = null;

function loadJsTemplate(): string {
  if (cachedJs !== null) return cachedJs;
  const candidates = [
    path.resolve(process.cwd(), 'templates/app.js'),
    path.resolve(process.cwd(), 'src/templates/app.js'),
    path.resolve(process.cwd(), '../templates/app.js'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        cachedJs = fs.readFileSync(p, 'utf8');
        return cachedJs;
      }
    } catch { /* continue */ }
  }
  throw new Error('templates/app.js not found');
}

export function buildJs(accent: string): string {
  return loadJsTemplate()
    .replace(/__ACCENT__/g, accent)
    .replace(/__FAVICON__/g, CLDS_FAVICON_TEMPLATE);
}
