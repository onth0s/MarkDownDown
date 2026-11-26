import fs from 'node:fs';
import path from 'node:path';
import type { CliOptions } from '../types.js';
import { build } from '../compile.js';
import { buildCompileOptions } from './options.js';
import { createMarkdownParser } from '../parser/markdown.js';
import { checkRoundTrip, resolveCheckTargets, extractEmbeddedSkeleton } from '../pipeline/check.js';
import { stitchDocument } from '../pipeline/stitch.js';
import { printCheckReport, reportCliError } from './report.js';

export function executeCheck(
  input: string,
  sourceArg: string | undefined,
  opts: CliOptions,
): number {
  const { htmlFile, sourceFile, error: targetErr } = resolveCheckTargets(input, sourceArg, opts.output);
  if (targetErr) {
    process.stderr.write(`ERROR: ${targetErr}\n`);
    return 1;
  }

  const inputFile = path.resolve(process.cwd(), input);
  const inputDir = path.dirname(inputFile);
  const stem = path.parse(inputFile).name;

  try {
    let htmlContent: string | null = null;
    let rawSource: string | null = null;

    if (sourceFile) {
      if (!fs.existsSync(sourceFile)) {
        process.stderr.write(`ERROR: Source file not found: ${sourceFile}\n`);
        return 1;
      }
      const rawInput = fs.readFileSync(sourceFile, 'utf8');
      rawSource = stitchDocument(rawInput, sourceFile, opts.allowExternalPaths === true).source;
    }

    if (htmlFile) {
      if (!fs.existsSync(htmlFile)) {
        process.stderr.write(`ERROR: HTML artifact not found: ${htmlFile}\n`);
        return 1;
      }
      htmlContent = fs.readFileSync(htmlFile, 'utf8');
    }

    if (!htmlContent && !sourceFile) {
      process.stderr.write('ERROR: Neither an HTML artifact nor a source file could be resolved for --check.\n');
      return 1;
    }

    if (!htmlContent && sourceFile) {
      // In-memory compile without writing to disk
      const { options: checkOptions, error: optErr } = buildCompileOptions(
        sourceFile,
        path.join(inputDir, `${stem}.html`),
        'single',
        { ...opts, verbose: false },
      );
      if (optErr || !checkOptions) {
        process.stderr.write(`ERROR: ${optErr}\n`);
        return 1;
      }
      const compiled = build(checkOptions);
      for (const w of compiled.warnings) process.stderr.write(`WARN: ${w}\n`);
      htmlContent = compiled.html;
    }

    if (!htmlContent) {
      process.stderr.write('ERROR: Failed to obtain HTML content to verify.\n');
      return 1;
    }

    if (!rawSource) {
      process.stderr.write('ERROR: Source file or content required for --check.\n');
      return 1;
    }

    const skeleton = extractEmbeddedSkeleton(htmlContent);
    const result = checkRoundTrip({
      md: createMarkdownParser(),
      html: htmlContent,
      rawSource,
      skeletonText: skeleton ? JSON.stringify(skeleton) : undefined,
    });

    const relSource = sourceFile ? (path.relative(process.cwd(), sourceFile) || sourceFile) : inputFile;
    const relHtml = htmlFile ? (path.relative(process.cwd(), htmlFile) || htmlFile) : '(in-memory compiled artifact)';

    printCheckReport(relSource, relHtml, result, opts.verbose);
    return result.ok ? 0 : 1;
  } catch (err) {
    reportCliError(err, opts.debug);
    return 1;
  }
}
