/**
 * Pipeline stage: assemble final HTML and write output.
 *
 * Generates hero section, CSS, JS, reads custom assets, assembles via
 * template, and writes to disk.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Options, CompileResult, HeroMeta } from '../types.js';
import type { FrontmatterResult } from '../parser/frontmatter.js';
import { buildCss } from '../renderer/css.js';
import { buildJs } from '../renderer/js.js';
import { assembleHtml } from '../renderer/template.js';
import { escHtml } from '../util/escape.js';

function buildHeroHtml(
  hero: HeroMeta,
  title: string,
): string {
  if (!hero.kicker && !hero.subtitle && !hero.pills?.length) return '';

  let html = '<section class="hero">';
  if (hero.kicker) html += `<div class="kicker">${escHtml(hero.kicker)}</div>`;
  if (title) html += `<h1>${escHtml(title)}</h1>`;
  if (hero.subtitle) html += `<p>${escHtml(hero.subtitle)}</p>`;
  if (hero.pills?.length) {
    html += '<div class="meta">';
    for (const pill of hero.pills) {
      html += `<span class="pill">${escHtml(pill)}</span>`;
    }
    html += '</div>';
  }
  html += '</section>';
  return html;
}

export function assembleAndWrite(
  options: Options,
  meta: FrontmatterResult['meta'],
  hero: HeroMeta,
  title: string,
  accent: string,
  bodyHtml: string,
  assetsDir: string,
  warnings: string[],
): CompileResult {
  const heroHtml = buildHeroHtml(hero, title);

  const hex = accent.replace('#', '');
  const accentRgb = `${parseInt(hex.slice(0, 2), 16)},${parseInt(hex.slice(2, 4), 16)},${parseInt(hex.slice(4, 6), 16)}`;

  const css = buildCss(accent, accentRgb);
  const js = buildJs(accent);

  let customCssContent: string | undefined;
  if (meta.customCss && fs.existsSync(meta.customCss)) {
    customCssContent = fs.readFileSync(meta.customCss, 'utf8');
  }
  let customJsContent: string | undefined;
  if (meta.customJs && fs.existsSync(meta.customJs)) {
    customJsContent = fs.readFileSync(meta.customJs, 'utf8');
  }

  const html = assembleHtml({
    title,
    metaDescription: title,
    css,
    js,
    body: bodyHtml,
    hero: heroHtml,
    outputMode: options.outputMode,
    cssHref: 'style.css',
    jsSrc: 'app.js',
    customCss: customCssContent,
    customJs: customJsContent,
    accent,
  });

  // Write output
  if (options.outputMode === 'single') {
    const outFile = options.outputPath.endsWith('.html')
      ? options.outputPath
      : options.outputPath + '.html';
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, html, 'utf8');
    if (options.verbose) process.stderr.write(`Written: ${outFile}\n`);
  } else {
    const outDir = options.outputPath;
    fs.mkdirSync(outDir, { recursive: true });
    const stem = path.basename(options.inputFile, path.extname(options.inputFile));
    fs.writeFileSync(path.join(outDir, `${stem}.html`), html, 'utf8');
    fs.writeFileSync(path.join(outDir, 'style.css'), css + (customCssContent ?? ''), 'utf8');
    fs.writeFileSync(path.join(outDir, 'app.js'), js + (customJsContent ?? ''), 'utf8');

    if (fs.existsSync(assetsDir)) {
      const destAssets = path.join(outDir, 'assets');
      fs.cpSync(assetsDir, destAssets, { recursive: true });
    }
    if (options.verbose) process.stderr.write(`Written: ${outDir}\n`);
  }

  return { html, warnings };
}
