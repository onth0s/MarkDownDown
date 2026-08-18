/**
 * Template assembler.
 * Reads shell.html, injects {{placeholders}}, and handles --single vs --split.
 */
import fs from 'node:fs';
import path from 'node:path';
import { escAttr } from '../util/escape.js';
import { CLDS_LOGO_PATHS, CLDS_FAVICON_TEMPLATE } from './logo.js';

/**
 * Computes a darkened version of the accent color (50% black mix).
 */
function darkenHex(hex: string): string {
  const n = hex.replace('#', '');
  const v = parseInt(n, 16);
  const r = Math.round(((v >> 16) & 255) * 0.5);
  const g = Math.round(((v >> 8) & 255) * 0.5);
  const b = Math.round((v & 255) * 0.5);
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

/** Builds the favicon data URI with the given accent. */
function buildFaviconHref(accent: string): string {
  const dark = darkenHex(accent);
  const svg = CLDS_FAVICON_TEMPLATE
    .replace(/\{accent\}/g, accent)
    .replace(/\{accentDark\}/g, dark);
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

/** Builds the inline brand‑logo SVG element. */
function buildLogoSvg(): string {
  return (
    `<svg class="brand-logo" aria-hidden="true" focusable="false" ` +
    `width="30" height="30" viewBox="0 0 1024 1024" ` +
    `fill="none" xmlns="http://www.w3.org/2000/svg">` +
    CLDS_LOGO_PATHS +
    `</svg>`
  );
}

/** Load the HTML shell template. */
function loadTemplate(): string {
  const cwdPath = path.resolve(process.cwd(), 'templates/shell.html');
  if (fs.existsSync(cwdPath)) return fs.readFileSync(cwdPath, 'utf8');
  throw new Error('shell.html template not found');
}

export interface AssembleOptions {
  title: string;
  metaDescription: string;
  css: string;
  js: string;
  body: string;
  hero?: string;
  outputMode: 'single' | 'split';
  cssHref?: string;
  jsSrc?: string;
  customCss?: string;
  customJs?: string;
  accent?: string;
}

export function assembleHtml(opts: AssembleOptions): string {
  let template = loadTemplate();

  // Basic replacements
  template = template.replace(/\{\{title\}\}/g, escAttr(opts.title));
  template = template.replace(/\{\{meta_description\}\}/g, escAttr(opts.metaDescription));
  template = template.replace('{{body}}', () => opts.body);
  template = template.replace('{{hero}}', () => opts.hero ?? '');

  // Logo and favicon always inject — fall back to default blue if no accent in frontmatter
  const effectiveAccent = opts.accent ?? '#3b82f6';
  const faviconHref = buildFaviconHref(effectiveAccent);
  template = template.replace('{{favicon_href}}', () => faviconHref);
  template = template.replace('{{logo_svg}}', () => buildLogoSvg());

  if (opts.outputMode === 'single') {
    let css = opts.css;
    if (opts.customCss) css += '\n' + opts.customCss;
    let js = opts.js;
    if (opts.customJs) js += '\n' + opts.customJs;
    template = template.replace(/<!-- SPLIT_LINK_CSS -->\n?/, '');
    template = template.replace(/<!-- SPLIT_SCRIPT_SRC -->\n?/, '');
    template = template.replace('{{css}}', () => css);
    template = template.replace('{{js}}', () => js);
  } else {
    template = template.replace(
      /<!-- SPLIT_LINK_CSS -->\n?/,`
<link rel="stylesheet" href="${opts.cssHref ?? 'style.css'}">`
    );
    template = template.replace(
      /<!-- SPLIT_SCRIPT_SRC -->\n?/,`
<script src="${opts.jsSrc ?? 'app.js'}"></script>`
    );
    template = template.replace(/<style>\{\{css\}\}<\/style>/, '');
    template = template.replace(/<script>\{\{js\}\}<\/script>/, '');
  }

  return template;
}
