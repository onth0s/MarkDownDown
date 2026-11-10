import path from 'node:path';
import type { CompileResult } from '../types.js';
import type { CheckResult } from '../pipeline/check.js';
import { CompileError, toErrorMessage } from '../util/error.js';

type WriteStream = { write(chunk: string): boolean };

export function printCompileSummary(
  stats: NonNullable<CompileResult['stats']>,
  elapsedMs: number,
  outputMode: 'single' | 'split',
  minify?: boolean,
  out: WriteStream = process.stdout,
): void {
  const { sections, wikilinks, frontmatterKeys, title, accent, outputFile, sizeBytes } = stats;
  const relOutput = path.relative(process.cwd(), outputFile) || outputFile;
  const sizeFormatted = sizeBytes >= 1024 * 1024
    ? `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`
    : `${(sizeBytes / 1024).toFixed(1)} KB`;

  out.write(`\n Markdown++ Compile Summary\n`);
  out.write(` ---------------------------\n`);
  out.write(` Title:       ${title}\n`);
  out.write(` Accent:      ${accent}\n`);
  if (stats.logo) {
    const relLogo = path.relative(process.cwd(), stats.logo) || stats.logo;
    out.write(` Logo:        ${relLogo}\n`);
  }
  out.write(` Sections:    ${sections}\n`);
  out.write(` Wikilinks:   ${wikilinks}\n`);
  if (stats.mirrorBlocks && stats.mirrorBlocks > 0) {
    out.write(` Mirror:      ${stats.mirrorBlocks} blocks (${stats.mirrorItems ?? 0} items, ${stats.mirrorProbes ?? 0} probes)\n`);
  }
  out.write(` Frontmatter: ${frontmatterKeys} entries\n`);
  out.write(` Mode:        ${outputMode} (${minify ? 'minified' : 'unminified'})\n`);
  out.write(` Output:      ${relOutput} (${sizeFormatted})\n`);
  out.write(` Time:        ${elapsedMs}ms\n\n`);
}

export type CheckReportData = Pick<CheckResult, 'ok' | 'semanticEqual' | 'byteEqual' | 'message'> & {
  firstDiff?: CheckResult['firstDiff'];
};

export function printCheckReport(
  relSource: string,
  relHtml: string,
  result: CheckReportData,
  verbose: boolean,
  out: WriteStream = process.stdout,
): void {
  out.write(`\n Markdown++ Round-Trip Check\n`);
  out.write(` --------------------------------\n`);
  out.write(` Source:      ${relSource}\n`);
  out.write(` Artifact:    ${relHtml}\n`);
  out.write(` ${result.message}\n`);
  if (!result.semanticEqual && result.firstDiff) {
    const d = result.firstDiff;
    out.write(`\n First semantic difference at line ${d.line}:\n`);
    if (verbose) {
      out.write(`   source:  ${JSON.stringify(d.source)}\n`);
      out.write(`   rebuilt: ${JSON.stringify(d.rebuilt)}\n`);
      let i = 0;
      while (i < d.source.length && i < d.rebuilt.length && d.source[i] === d.rebuilt[i]) i++;
      out.write(`   diverges at char ${i}:\n`);
      out.write(`     source  ...${JSON.stringify(d.source.slice(Math.max(0, i - 40), i + 40))}\n`);
      out.write(`     rebuilt ...${JSON.stringify(d.rebuilt.slice(Math.max(0, i - 40), i + 40))}\n`);
    } else {
      out.write(`   source:  ${JSON.stringify(d.source.slice(0, 160))}\n`);
      out.write(`   rebuilt: ${JSON.stringify(d.rebuilt.slice(0, 160))}\n`);
      out.write(`   (re-run with -v for the exact divergence)\n`);
    }
  }
  out.write(`\n Result:     ${result.ok ? 'PASS' : 'FAIL'}\n\n`);
}

export function reportCliError(
  err: unknown,
  debug = false,
  errStream: WriteStream = process.stderr,
): void {
  if (err instanceof CompileError) {
    errStream.write(`ERROR: ${err.message}\n`);
    if (debug && err.stack) errStream.write(`${err.stack}\n`);
  } else {
    errStream.write(`ERROR: ${toErrorMessage(err)}\n`);
    if (debug && err instanceof Error && err.stack) errStream.write(`${err.stack}\n`);
  }
}
