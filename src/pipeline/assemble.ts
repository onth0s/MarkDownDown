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
import { buildCss, computeLuminosityParams } from '../renderer/css.js';
import { buildJs } from '../renderer/js.js';
import { assembleHtml } from '../renderer/template.js';
import { escHtml } from '../util/escape.js';
import { hexToRgb } from '../util/color.js';
import { toErrorMessage } from '../util/error.js';
import { processLogo } from '../renderer/logo-processor.js';

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
  md?: import('markdown-it').default,
): string {
  if (!hero.kicker && !hero.subtitle && !hero.pills?.length) return '';

  const renderInline = (str: string) => {
    if (!str) return '';
    return md ? md.renderInline(str) : escHtml(str);
  };

  let html = '<section class="hero">';
  if (hero.kicker) html += `<div class="kicker">${renderInline(hero.kicker)}</div>`;
  if (title) html += `<h1>${renderInline(title)}</h1>`;
  if (hero.subtitle) html += `<p>${renderInline(hero.subtitle)}</p>`;
  if (hero.pills?.length) {
    html += '<div class="meta">';
    for (const pill of hero.pills) {
      html += `<span class="pill">${renderInline(pill)}</span>`;
    }
    html += '</div>';
  }
  html += '</section>';
  return html;
}

export interface AssembledDocument {
  html: string;
  css: string;
  js: string;
  customCssContent?: string;
  customJsContent?: string;
  finalOutputFile: string;
  effectiveLogoPath?: string;
}

export function assembleDocument(
  options: Options,
  meta: FrontmatterResult['meta'],
  hero: HeroMeta,
  title: string,
  accent: string,
  bodyHtml: string,
  headings: import('../types.js').Heading[],
  md?: import('markdown-it').default,
): AssembledDocument {
  const heroHtml = buildHeroHtml(hero, title, md);
  const accentRgb = hexToRgb(accent);

  const routes: Record<string, string> = {};
  if (title) {
    routes['__doc-title__'] = title.length > 40 ? title.slice(0, 37) + '…' : title;
  }
  for (const h of headings) {
    if (!h.id) continue;
    const cleanText = h.text.replace(/<[^>]+>/g, '').replace(/[`*_~[\]]/g, '').trim();
    routes[h.id] = cleanText.length > 40 ? cleanText.slice(0, 37) + '…' : cleanText;
  }

  const effectiveLogoPath = meta.logo ?? options.logo;
  const processedLogo = processLogo(effectiveLogoPath, accent);

  const effectiveBgLum = meta.bgLum ?? options.bgLum;
  const lumParams = computeLuminosityParams(effectiveBgLum);
  const css = buildCss(accent, accentRgb, effectiveBgLum);
  const js = buildJs({
    accent,
    routes,
    faviconTemplate: processedLogo.faviconTemplate,
    darkBg: lumParams.darkBg,
    darkSurface: lumParams.darkSurface,
    darkBgMix: `${lumParams.darkBgMixPct}%`,
    darkBgTint: `${lumParams.darkTintPct}%`,
    darkSurfMix: `${lumParams.darkSurfaceMixPct}%`,
    darkSurfTint: `${lumParams.darkSurfaceTintPct}%`,
    lightBg: lumParams.lightBg,
    lightSurface: lumParams.lightSurface,
    lightBgMix: `${lumParams.lightBgMixPct}%`,
    lightBgTint: `${lumParams.lightTintPct}%`,
    lightSurfMix: `${lumParams.lightSurfaceMixPct}%`,
    lightSurfTint: `${lumParams.lightSurfaceTintPct}%`,
    theme: meta.theme ?? options.theme ?? 'dark',
  });

  let customCssContent: string | undefined;
  if (meta.customCss && fs.existsSync(meta.customCss)) {
    customCssContent = fs.readFileSync(meta.customCss, 'utf8');
  }
  let customJsContent: string | undefined;
  if (meta.customJs && fs.existsSync(meta.customJs)) {
    customJsContent = fs.readFileSync(meta.customJs, 'utf8');
  }

  const effectiveTheme = meta.theme ?? options.theme ?? 'dark';

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
    theme: effectiveTheme,
    minify: options.minify,
    logoSvg: processedLogo.navbarLogo,
    faviconHref: processedLogo.faviconHref,
  });

  const outFile = options.outputPath.endsWith('.html')
    ? options.outputPath
    : options.outputPath + '.html';
  const finalOutputFile = options.outputMode === 'single' ? outFile : options.outputPath;

  return {
    html,
    css,
    js,
    customCssContent,
    customJsContent,
    finalOutputFile,
    effectiveLogoPath,
  };
}

export function writeOutput(
  options: Options,
  assembled: AssembledDocument,
  assetsDir: string,
  warnings: string[],
): number {
  let finalSize = Buffer.byteLength(assembled.html, 'utf8');

  if (options.outputMode === 'single') {
    fs.mkdirSync(path.dirname(assembled.finalOutputFile), { recursive: true });
    fs.writeFileSync(assembled.finalOutputFile, assembled.html, 'utf8');
    if (options.verbose) process.stderr.write(`Written: ${assembled.finalOutputFile}\n`);
  } else {
    const outDir = options.outputPath;
    fs.mkdirSync(outDir, { recursive: true });
    const stem = path.basename(options.inputFile, path.extname(options.inputFile));
    const htmlPath = path.join(outDir, `${stem}.html`);
    const cssPath = path.join(outDir, 'style.css');
    const jsPath = path.join(outDir, 'app.js');
    fs.writeFileSync(htmlPath, assembled.html, 'utf8');
    fs.writeFileSync(cssPath, assembled.css + (assembled.customCssContent ?? ''), 'utf8');
    fs.writeFileSync(jsPath, assembled.js + (assembled.customJsContent ?? ''), 'utf8');
    finalSize = Buffer.byteLength(assembled.html, 'utf8') + Buffer.byteLength(assembled.css, 'utf8') + Buffer.byteLength(assembled.js, 'utf8');

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

  return finalSize;
}

export function assembleAndWrite(
  options: Options,
  meta: FrontmatterResult['meta'],
  hero: HeroMeta,
  title: string,
  accent: string,
  bodyHtml: string,
  assetsDir: string,
  headings: import('../types.js').Heading[],
  warnings: string[],
  md?: import('markdown-it').default,
): CompileResult {
  const assembled = assembleDocument(options, meta, hero, title, accent, bodyHtml, headings, md);
  const finalSize = writeOutput(options, assembled, assetsDir, warnings);

  return {
    html: assembled.html,
    warnings,
    stats: {
      sections: headings.length,
      wikilinks: 0, // populated by compile
      frontmatterKeys: Object.keys(meta).length + (hero.kicker ? 1 : 0) + (hero.subtitle ? 1 : 0) + (hero.pills?.length ? 1 : 0),
      title,
      accent,
      logo: assembled.effectiveLogoPath,
      outputFile: assembled.finalOutputFile,
      sizeBytes: finalSize,
    },
  };
}
