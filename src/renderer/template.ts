/**
 * Template assembler.
 * Reads shell.html, injects {{placeholders}}, and handles --single vs --split.
 */
import { loadTemplate } from '../util/template-loader.js';
import { hexToHsl, hslToHex } from '../util/color.js';
import { escHtml } from '../util/escape.js';
import { processLogo } from './logo-processor.js';
import { minifyCss, minifyJs, minifyHtml } from '../util/minify.js';

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
  theme?: 'dark' | 'light';
  minify?: boolean;
  logoSvg?: string;
  faviconHref?: string;
}

export function assembleHtml(opts: AssembleOptions): string {
  let template = loadTemplate('shell.html');

  // Initial theme
  const initialTheme = opts.theme ?? 'dark';
  template = template.replace('data-theme="dark"', `data-theme="${initialTheme}"`);

  // Basic replacements
  template = template.replace(/\{\{title\}\}/g, escHtml(opts.title));
  template = template.replace(/\{\{meta_description\}\}/g, escHtml(opts.metaDescription));
  template = template.replace('{{body}}', () => opts.body);
  template = template.replace('{{hero}}', () => opts.hero ?? '');

  // Logo and favicon injection
  const effectiveAccent = opts.accent ?? '#3b82f6';
  const defaultProcessed = opts.faviconHref && opts.logoSvg ? null : processLogo(undefined, effectiveAccent);
  const faviconHref = opts.faviconHref ?? defaultProcessed!.faviconHref;
  let logoMarkup = opts.logoSvg ?? defaultProcessed!.navbarLogo;

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
