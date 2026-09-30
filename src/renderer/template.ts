/**
 * Template assembler.
 * Reads shell.html, injects {{placeholders}}, and handles --single vs --split.
 */
import { loadTemplate } from '../util/template-loader.js';
import { hexToHsl, hslToHex } from '../util/color.js';
import { escHtml } from '../util/escape.js';
import { processLogo } from './logo.js';
import { minifyCss, minifyJs, minifyHtml } from '../util/minify.js';
import { extractProse } from './html-extract.js';
import { pruneSkeleton, serializeSkeletonPayload, type Skeleton } from './skeleton.js';

/**
 * Placeholder for the download payload, replaced post-minification.
 * Whitespace-free so the HTML minifier cannot alter it, and not a comment so
 * minifyHtml's comment stripper leaves it alone.
 */
const SKELETON_TOKEN = 'MDD_SKELETON_PAYLOAD_TOKEN';

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
  /**
   * Source skeleton for the in-document download button. Serialized into the
   * artifact AFTER minification, pruned to the slots the DOM cannot reproduce,
   * so the payload never carries a second copy of the document text.
   */
  skeleton?: Skeleton;
  /** Original filename, used as the download's suggested name. */
  sourceName?: string;
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

  // Download payload: the tag ships a bare token that is swapped for the pruned
  // skeleton after minification. The token must be whitespace-free so the HTML
  // minifier cannot alter it, and it must not sit in the DOM (minifyHtml strips
  // comments). Builds with no skeleton drop the tag entirely.
  const embedSkeleton = opts.skeleton !== undefined;
  if (embedSkeleton) {
    template = template.replace('{{mdd_skeleton}}', () => SKELETON_TOKEN);
  } else {
    template = template.replace(
      /<script type="application\/json" id="mdd-skeleton">MDD_SKELETON_PAYLOAD_TOKEN<\/script>/,
      '',
    );
  }

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

  // Serialize the download payload last, against the FINAL html. Prose runs are
  // read from the shipped markup (minifier included), so the pruned span set
  // reflects exactly what a browser will see on right-click.
  if (embedSkeleton) {
    const prose = extractProse(template);
    const pruned = pruneSkeleton(opts.skeleton!, prose);
    const payload = serializeSkeletonPayload(pruned, opts.sourceName ?? 'document.mdd');
    return template.replace(SKELETON_TOKEN, () => payload);
  }

  return template;
}
