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
<title>{{title}}</title>
<meta name="description" content="{{meta_description}}">
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

  if (opts.outputMode === 'single') {
    let css = opts.css;
    if (opts.customCss) css += '\n' + opts.customCss;
    let js = opts.js;
    if (opts.customJs) js += '\n' + opts.customJs;
    template = template.replace('<!-- SPLIT_LINK_CSS -->', '');
    template = template.replace('<!-- SPLIT_SCRIPT_SRC -->', '');
    template = template.replace('{{css}}', () => css);
    template = template.replace('{{js}}', () => js);
  } else {
    template = template.replace(
      '<!-- SPLIT_LINK_CSS -->',
      `<link rel="stylesheet" href="${opts.cssHref ?? 'style.css'}">`
    );
    template = template.replace(
      '<!-- SPLIT_SCRIPT_SRC -->',
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
