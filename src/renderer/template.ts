/**
 * Template assembler.
 * Reads shell.html, injects {{placeholders}}, and handles --single vs --split.
 */
import { loadTemplate } from '../util/template-loader.js';
import { darkenHex, hexToHsl, hslToHex } from '../util/color.js';
import { escAttr } from '../util/escape.js';
import { DEFAULT_LOGO_PATHS, DEFAULT_FAVICON_TEMPLATE } from './logo.js';
import { minifyCss, minifyJs, minifyHtml } from '../util/minify.js';

/** Builds the favicon data URI with the given accent. */
function buildFaviconHref(accent: string): string {
  const dark = darkenHex(accent);
  const svg = DEFAULT_FAVICON_TEMPLATE
    .replace(/\{accent\}/g, accent)
    .replace(/\{accentDark\}/g, dark);
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

/** Builds the inline brand-logo SVG element. */
function buildLogoSvg(): string {
  return (
    `<svg class="brand-logo" aria-hidden="true" focusable="false" ` +
    `width="30" height="30" viewBox="0 0 1024 1024" ` +
    `fill="none" xmlns="http://www.w3.org/2000/svg">` +
    DEFAULT_LOGO_PATHS +
    `</svg>`
  );
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
  minify?: boolean;
  logoSvg?: string;
  faviconHref?: string;
}

export function assembleHtml(opts: AssembleOptions): string {
  let template = loadTemplate('shell.html');

  // Basic replacements
  template = template.replace(/\{\{title\}\}/g, escAttr(opts.title));
  template = template.replace(/\{\{meta_description\}\}/g, escAttr(opts.metaDescription));
  template = template.replace('{{body}}', () => opts.body);
  template = template.replace('{{hero}}', () => opts.hero ?? '');

  // Logo and favicon injection
  const effectiveAccent = opts.accent ?? '#3b82f6';
  const faviconHref = opts.faviconHref ?? buildFaviconHref(effectiveAccent);
  let logoMarkup = opts.logoSvg ?? buildLogoSvg();

  // If logoMarkup contains static {L_xx} placeholders, populate them with the initial accent
  if (logoMarkup.includes('{L_')) {
    const [targetH, targetS] = hexToHsl(effectiveAccent);
    logoMarkup = logoMarkup.replace(/\{L_(\d+)\}/g, (_, l) => hslToHex(targetH, targetS, parseInt(l, 10)));
  }

  template = template.replace('{{favicon_href}}', () => faviconHref);
  template = template.replace('{{logo_svg}}', () => logoMarkup);

  if (opts.outputMode === 'single') {
    let css = opts.css;
    if (opts.customCss) css += '\n' + opts.customCss;
    let js = opts.js;
    if (opts.customJs) js += '\n' + opts.customJs;

    if (opts.minify === true) {
      css = minifyCss(css);
      js = minifyJs(js);
    }

    template = template.replace(/<!-- SPLIT_LINK_CSS -->\n?/, '');
    template = template.replace(/<!-- SPLIT_SCRIPT_SRC -->\n?/, '');
    template = template.replace('{{css}}', () => css);
    template = template.replace('{{js}}', () => js);

    if (opts.minify === true) {
      template = minifyHtml(template);
    }
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
