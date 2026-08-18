/**
 * Markdown++ compile pipeline.
 *
 * Steps: frontmatter → lex → resolve → render → assemble
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Options, CompileResult, Heading, Asset } from './types.js';
import { parseFrontmatter } from './parser/frontmatter.js';
import { createMarkdownParser } from './parser/markdown.js';
import { extractHeadings } from './resolver/heading.js';
import { scanAssets } from './resolver/asset.js';
import { resolveLinks } from './pipeline/resolve-links.js';
import { renderBody } from './pipeline/render-body.js';
import { assembleAndWrite } from './pipeline/assemble.js';
import { isValidHex } from './util/color.js';

export function compile(options: Options): CompileResult {
  const warnings: string[] = [];
  const inputDir = path.dirname(options.inputFile);

  // 1. Read source
  const rawSource = fs.readFileSync(options.inputFile, 'utf8');

  // 2. Frontmatter
  const { meta, hero, body: markdownBody, warnings: fmWarnings } = parseFrontmatter(rawSource, inputDir);
  warnings.push(...fmWarnings);
  const title = meta.title ?? options.title;
  const accent = meta.accent ?? options.accent;
  if (!isValidHex(accent)) {
    warnings.push(`Invalid accent color "${accent}", falling back to #3b82f6`);
  }
  const assetsDir = meta.assetsDir ?? options.assetsDir;

  // 3. Lex
  const md = createMarkdownParser();
  const tokens = md.parse(markdownBody, {});

  // 4. Extract headings + scan assets
  const headings: Heading[] = extractHeadings(tokens);
  const assets: Asset[] = scanAssets(assetsDir);

  // 5. Resolve wikilinks + build base64 map
  const { pendingLinks, assetBase64Map } = resolveLinks(
    tokens, headings, assets, options, warnings,
  );

  // 6. Render body HTML
  const bodyHtml = renderBody(
    md, markdownBody, pendingLinks, assetBase64Map, options, title, warnings,
  );

  // 7. Assemble and write
  return assembleAndWrite(
    options, meta, hero, title, accent, bodyHtml, assetsDir, warnings,
  );
}
