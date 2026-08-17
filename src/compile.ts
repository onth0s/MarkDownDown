/**
 * Markdown++ compile pipeline.
 *
 * Steps: frontmatter → lex → resolve → render → assemble
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Options, CompileResult, Heading, Asset } from './types.js';
import { parseFrontmatter } from './parser/frontmatter.js';
import { createMarkdownParser, renderWikilinkToken } from './parser/markdown.js';
import { parseTitleDirective } from './parser/diagram.js';
import { extractHeadings } from './resolver/heading.js';
import { scanAssets } from './resolver/asset.js';
import { resolveWikilink } from './resolver/collision.js';
import { diagramParse, diagramLayout, diagramBuildSvg } from './renderer/diagram-svg.js';
import { tableParse, tableBuildSvg } from './renderer/table-svg.js';
import { buildCss } from './renderer/css.js';
import { buildJs } from './renderer/js.js';
import { assembleHtml } from './renderer/template.js';

/** Convert a hex accent like '#3b82f6' to 'R,G,B' string */
function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r},${g},${b}`;
}

/**
 * Compile a .mdd file to HTML.
 * Throws on fatal errors; returns CompileResult with warnings on soft issues.
 */
export async function compile(options: Options): Promise<CompileResult> {
  const warnings: string[] = [];
  const inputDir = path.dirname(options.inputFile);

  // ── 1. Read source ──────────────────────────────────────────────────────────
  const rawSource = fs.readFileSync(options.inputFile, 'utf8');

  // ── 2. Frontmatter ──────────────────────────────────────────────────────────
  const { meta, body: markdownBody } = parseFrontmatter(rawSource, inputDir);

  // Merge frontmatter into options (frontmatter wins over CLI defaults)
  const title = meta.title ?? options.title;
  const accent = meta.accent ?? options.accent;
  const accentRgb = hexToRgb(accent);
  const assetsDir = meta.assetsDir ?? options.assetsDir;

  // ── 2b. Hero section from frontmatter ───────────────────────────────────────
  let heroHtml = '';
  if (meta.kicker || meta.subtitle || meta.pills?.length) {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    heroHtml = '<section class="hero">';
    if (meta.kicker) heroHtml += `<div class="kicker">${esc(meta.kicker)}</div>`;
    if (title) heroHtml += `<h1>${esc(title)}</h1>`;
    if (meta.subtitle) heroHtml += `<p>${esc(meta.subtitle)}</p>`;
    if (meta.pills?.length) {
      heroHtml += '<div class="meta">';
      for (const pill of meta.pills) {
        heroHtml += `<span class="pill">${esc(pill)}</span>`;
      }
      heroHtml += '</div>';
    }
    heroHtml += '</section>';
  }

  // ── 3. Lex ──────────────────────────────────────────────────────────────────
  const md = createMarkdownParser();
  const tokens = md.parse(markdownBody, {});

  // ── 4. Extract headings (for wikilink resolution) ───────────────────────────
  const headings: Heading[] = extractHeadings(tokens);

  // ── 5. Scan assets ──────────────────────────────────────────────────────────
  const assets: Asset[] = scanAssets(assetsDir);

  // ── 6. Collect wikilink tokens ──────────────────────────────────────────────
  interface PendingWikilink {
    target: string;
    display: string;
    resolved?: ReturnType<typeof resolveWikilink>;
    error?: string;
  }
  const pendingLinks: PendingWikilink[] = [];
  let hadErrors = false;

  for (const token of tokens) {
    if (token.type === 'inline' && token.children) {
      for (const child of token.children) {
        if (child.type === 'wikilink') {
          const target = child.content;
          const display = child.info || target;
          try {
            const resolved = resolveWikilink(target, display, headings, assets);
            pendingLinks.push({ target, display, resolved });
          } catch (err) {
            const msg = (err as Error).message;
            pendingLinks.push({ target, display, error: msg });
            process.stderr.write(msg + '\n');
            hadErrors = true;
          }
        }
      }
    }
  }

  if (hadErrors) {
    throw new Error('Compilation failed: unresolved or ambiguous wikilinks. See stderr.');
  }

  // ── 7. Build asset base64 map (--single mode) ───────────────────────────────
  const assetBase64Map = new Map<string, string>();
  if (options.outputMode === 'single') {
    for (const asset of assets) {
      if (asset.kind === 'image' || asset.kind === 'video') {
        try {
          const data = fs.readFileSync(asset.absolutePath);
          const ext = path.extname(asset.absolutePath).slice(1).toLowerCase();
          const mime = getMime(ext);
          assetBase64Map.set(asset.absolutePath, `data:${mime};base64,${data.toString('base64')}`);
        } catch {
          warnings.push(`Could not read asset: ${asset.relativePath}`);
        }
      }
    }
  }

  // ── 8. Render: walk tokens, produce HTML ────────────────────────────────────
  // We use a custom rendering pass: render normally via markdown-it, then
  // post-process the wikilink tokens and inject SVGs for diagram/table blocks.

  // Build link lookup map for fast render-time access
  const linkMap = new Map<string, PendingWikilink>();
  for (const pw of pendingLinks) {
    linkMap.set(`${pw.target}|${pw.display}`, pw);
  }

  // Custom renderer for wikilink tokens
  md.renderer.rules['wikilink'] = (tokens, idx) => {
    const tok = tokens[idx];
    const target = tok.content;
    const display = tok.info || target;
    const pw = linkMap.get(`${target}|${display}`);
    if (!pw?.resolved) return `[[${target}]]`;
    return renderWikilinkToken(target, display, pw.resolved, options.outputMode, assetBase64Map);
  };

  // Render markdown to HTML
  let bodyHtml = md.render(markdownBody);

  // ── 9. Inject diagram SVGs ──────────────────────────────────────────────────
  if (!options.noDiagrams) {
    bodyHtml = bodyHtml.replace(
      /<div class="code-wrap diagram" data-title="([^"]*)">\s*<pre><code class="language-diagram">([\s\S]*?)<\/code><\/pre>\s*<div class="diagram-render"><\/div>\s*<\/div>/g,
      (match, titleAttr, codeContent) => {
        try {
          const rawCode = htmlDecode(codeContent);
          const { title: extractedTitle, body: diagramBody } = parseTitleDirective(rawCode);
          const diagTitle = extractedTitle || titleAttr || title;
          const model = diagramParse(diagramBody);
          if (model.nodes.size === 0) {
            warnings.push(`diagram: no nodes found, skipped render`);
            return match;
          }
          diagramLayout(model);
          const svg = diagramBuildSvg(model, diagTitle);
          return (
            `<div class="code-wrap diagram" data-title="${escAttr(diagTitle)}">` +
            `<pre><code class="language-diagram">${codeContent}</code></pre>` +
            `<div class="diagram-render">${svg}</div>` +
            `</div>`
          );
        } catch (err) {
          warnings.push(`diagram render failed: ${(err as Error).message}`);
          return match;
        }
      }
    );
  }

  // ── 10. Inject table SVGs ────────────────────────────────────────────────────
  if (!options.noTables) {
    bodyHtml = bodyHtml.replace(
      /<div class="code-wrap table" data-title="([^"]*)">\s*<pre><code class="language-table">([\s\S]*?)<\/code><\/pre>\s*<div class="table-render"><\/div>\s*<\/div>/g,
      (match, titleAttr, codeContent) => {
        try {
          const rawCode = htmlDecode(codeContent);
          const { title: extractedTitle, body: tableBody } = parseTitleDirective(rawCode);
          const tblTitle = extractedTitle || titleAttr || title;
          const model = tableParse(tableBody);
          if (!model.headers.length) {
            warnings.push(`table: no headers found, skipped render`);
            return match;
          }
          const svg = tableBuildSvg(model, tblTitle);
          return (
            `<div class="code-wrap table" data-title="${escAttr(tblTitle)}">` +
            `<pre><code class="language-table">${codeContent}</code></pre>` +
            `<div class="table-render">${svg}</div>` +
            `</div>`
          );
        } catch (err) {
          warnings.push(`table render failed: ${(err as Error).message}`);
          return match;
        }
      }
    );
  }

  // ── 11. Wrap code blocks + copy buttons ──────────────────────────────────────
  // Insert copy button into diagram/table code-wrap divs.
  bodyHtml = bodyHtml.replace(
    /(<div class="code-wrap (?:diagram|table)"[^>]*>)(<pre><code)/g,
    '$1<button class="copy-btn" type="button">Copy</button>$2'
  );
  // Wrap bare <pre><code> (not inside a code-wrap) in new code-wrap with copy button.
  bodyHtml = bodyHtml.replace(
    /(?<!>)<pre><code/g,
    '<div class="code-wrap"><button class="copy-btn" type="button">Copy</button><pre><code'
  );
  bodyHtml = bodyHtml.replace(
    /(?<!<\/div>)<\/code><\/pre>(?!\s*<div)/g,
    '</code></pre></div>'
  );

  // ── 12. Build CSS / JS ───────────────────────────────────────────────────────
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

  // ── 12. Assemble ─────────────────────────────────────────────────────────────
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
  });

  // ── 13. Write output ─────────────────────────────────────────────────────────
  if (options.outputMode === 'single') {
    const outFile = options.outputPath.endsWith('.html')
      ? options.outputPath
      : options.outputPath + '.html';
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, html, 'utf8');
    if (options.verbose) process.stderr.write(`Written: ${outFile}\n`);
  } else {
    // --split
    const outDir = options.outputPath;
    fs.mkdirSync(outDir, { recursive: true });
    const stem = path.basename(options.inputFile, path.extname(options.inputFile));
    fs.writeFileSync(path.join(outDir, `${stem}.html`), html, 'utf8');
    fs.writeFileSync(path.join(outDir, 'style.css'), css + (customCssContent ?? ''), 'utf8');
    fs.writeFileSync(path.join(outDir, 'app.js'), js + (customJsContent ?? ''), 'utf8');

    // Copy assets
    if (fs.existsSync(assetsDir)) {
      const destAssets = path.join(outDir, 'assets');
      copyDir(assetsDir, destAssets);
    }
    if (options.verbose) process.stderr.write(`Written: ${outDir}\n`);
  }

  return { html, warnings };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function htmlDecode(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function getMime(ext: string): string {
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    mp4: 'video/mp4',
    webm: 'video/webm',
  };
  return map[ext] ?? 'application/octet-stream';
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
