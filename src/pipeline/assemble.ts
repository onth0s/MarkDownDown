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
import { hexToRgb } from '../util/color.js';
import { toErrorMessage } from '../util/error.js';

/** Recursively copy a directory, skipping dotfiles and symlinks. */
function safeCopyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      safeCopyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

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

  const accentRgb = hexToRgb(accent);

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
    minify: options.minify,
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
      try {
        safeCopyDir(assetsDir, destAssets);
      } catch (err) {
        warnings.push(`Failed to copy assets: ${toErrorMessage(err)}`);
      }
    }
    if (options.verbose) process.stderr.write(`Written: ${outDir}\n`);
  }

  return { html, warnings };
}
