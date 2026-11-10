/**
 * Markdown++ compile pipeline.
 *
 * Steps: frontmatter → lex → resolve → render → assemble
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Options, CompileResult, Heading, Asset, CompileContext } from './types.js';
import { parseFrontmatter } from './parser/frontmatter.js';
import { createMarkdownParser } from './parser/markdown.js';
import { extractHeadings } from './resolver/heading.js';
import { scanAssets } from './resolver/asset.js';
import { resolveLinks } from './pipeline/resolve-links.js';
import { renderBody } from './pipeline/render-body.js';
import { assembleDocument, writeOutput, type AssembledDocument } from './pipeline/assemble.js';
import { buildSkeleton } from './renderer/skeleton/index.js';
import { isValidHex, formatHexWithHash } from './util/color.js';
import { CompileError } from './util/error.js';

export interface BuildResult extends CompileResult {
  assembled: AssembledDocument;
  assetsDir: string;
}

/**
 * Pure compilation pipeline: reads inputs, parses, resolves links, renders,
 * and assembles the document in memory without writing anything to disk.
 */
export function build(options: Options): BuildResult {
  const warnings: string[] = [];
  const inputDir = path.dirname(options.inputFile);

  // 1. Read source
  const rawSource = options.rawSource ?? fs.readFileSync(options.inputFile, 'utf8');

  // 2. Frontmatter
  const { meta, hero, body: markdownBody, warnings: fmWarnings } = parseFrontmatter(rawSource, inputDir);
  warnings.push(...fmWarnings);
  const rawAccent = meta.accent ?? options.accent;
  if (!isValidHex(rawAccent)) {
    throw new CompileError(`Invalid accent color "${rawAccent}". Must be a valid 3- or 6-digit hex color (e.g. #3b82f6)`);
  }
  const accent = formatHexWithHash(rawAccent);
  const assetsDir = meta.assetsDir ?? options.assetsDir;

  // 3. Lex
  const md = createMarkdownParser();
  const tokens = md.parse(markdownBody, {});

  // 4. Extract headings + scan assets
  const headings: Heading[] = extractHeadings(tokens);
  const assets: Asset[] = scanAssets(assetsDir);

  // Determine document title: frontmatter.title -> first H1 -> options.title
  const firstH1 = headings.find((h) => h.level === 1);
  const title = meta.title ?? (firstH1 ? firstH1.text : options.title);

  // 5. Construct unified compile context
  const resolvedOptions: Options = { ...options, accent };
  const ctx: CompileContext = {
    options: resolvedOptions,
    meta,
    hero,
    title,
    accent,
    assetsDir,
    headings,
    warnings,
    md,
  };

  // 6. Resolve wikilinks + build base64 map
  const { pendingLinks, assetBase64Map } = resolveLinks(tokens, assets, ctx);

  // 7. Render body HTML
  const { html: bodyHtml, mirrorStats } = renderBody({
    ctx,
    markdownBody,
    pendingLinks,
    assetBase64Map,
    tokens,
  });

  // 7b. Source skeleton for the in-document download button: the same data
  // `mdd --check` ratifies, so a browser can reconstruct the exact .mdd from
  // the artifact alone. The assembler prunes it to the slots the rendered DOM
  // cannot reproduce before serializing it into the page.
  const skeleton = buildSkeleton(md, rawSource, tokens);
  const sourceName = path.basename(options.inputFile, path.extname(options.inputFile)) + '.mdd';

  // 8. Assemble in-memory
  const assembled = assembleDocument({
    ctx,
    bodyHtml,
    mddSkeleton: skeleton,
    mddSourceName: sourceName,
  });

  const inMemorySize = resolvedOptions.outputMode === 'single'
    ? Buffer.byteLength(assembled.html, 'utf8')
    : Buffer.byteLength(assembled.html, 'utf8') +
      Buffer.byteLength(assembled.css, 'utf8') +
      Buffer.byteLength(assembled.js, 'utf8') +
      Buffer.byteLength(assembled.customCssContent ?? '', 'utf8') +
      Buffer.byteLength(assembled.customJsContent ?? '', 'utf8');

  return {
    html: assembled.html,
    warnings,
    assembled,
    assetsDir,
    stats: {
      sections: headings.length,
      wikilinks: pendingLinks.length,
      frontmatterKeys: Object.keys(meta).length + (hero.kicker ? 1 : 0) + (hero.subtitle ? 1 : 0) + (hero.pills?.length ? 1 : 0),
      title,
      accent,
      logo: assembled.effectiveLogoPath,
      outputFile: assembled.finalOutputFile,
      sizeBytes: inMemorySize,
      mirrorBlocks: mirrorStats?.blocks ?? 0,
      mirrorItems: mirrorStats?.items ?? 0,
      mirrorProbes: mirrorStats?.probes ?? 0,
    },
  };
}

/**
 * Builds the document and writes all outputs to disk.
 */
export function compileToDisk(options: Options): CompileResult {
  const built = build(options);
  const finalSize = writeOutput(options, built.assembled, built.assetsDir, built.warnings);
  if (built.stats) {
    built.stats.sizeBytes = finalSize;
  }
  return {
    html: built.html,
    warnings: built.warnings,
    stats: built.stats,
  };
}

/**
 * Default compile entry point, compiles and writes to disk.
 */
export function compile(options: Options): CompileResult {
  return compileToDisk(options);
}
