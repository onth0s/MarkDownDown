/**
 * Template assembler.
 * Reads shell.html, injects {{placeholders}}, and handles --single vs --split.
 */
import fs from 'node:fs';
import path from 'node:path';

declare const __dirname: string;

function loadTemplate(): string {
  const candidates = [
    path.resolve(process.cwd(), 'templates/shell.html'),
    path.resolve(__dirname, '../templates/shell.html'),
    path.resolve(__dirname, '../../templates/shell.html'),
  ];

  for (const p of candidates) {
    try { if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8'); } catch {}
  }

  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="{{meta_description}}">
<link id="dynamicFavicon" rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%233b82f6'/%3E%3Ctext x='16' y='22' font-size='14' font-family='monospace' font-weight='bold' text-anchor='middle' fill='white'%3EM%2B%3C/text%3E%3C/svg%3E">
<title>{{title}}</title>
<!-- SPLIT_LINK_CSS -->
<style>{{css}}</style>
</head>
<body>
<article class="article" id="article">{{body}}</article>
<!-- SPLIT_SCRIPT_SRC -->
<script>{{js}}</script>
</body>
</html>`;
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
}

export function assembleHtml(opts: AssembleOptions): string {
  let template = loadTemplate();

  template = template.replace(/\{\{title\}\}/g, escAttr(opts.title));
  template = template.replace(/\{\{meta_description\}\}/g, escAttr(opts.metaDescription));
  template = template.replace('{{body}}', () => opts.body);
  template = template.replace('{{hero}}', () => opts.hero ?? '');

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
      /<!-- SPLIT_LINK_CSS -->\n?/,
      `<link rel="stylesheet" href="${opts.cssHref ?? 'style.css'}">`
    );
    template = template.replace(
      /<!-- SPLIT_SCRIPT_SRC -->\n?/,
      `<script src="${opts.jsSrc ?? 'app.js'}"></script>`
    );
    template = template.replace(/<style>\{\{css\}\}<\/style>/, '');
    template = template.replace(/<script>\{\{js\}\}<\/script>/, '');
  }

  return template;
}

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
