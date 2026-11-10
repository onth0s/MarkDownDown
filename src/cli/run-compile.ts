import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import type { Options, CliOptions } from '../types.js';
import { compile } from '../compile.js';
import { resolveCliLogoPath } from '../renderer/logo.js';
import { printCompileSummary, reportCliError } from './report.js';
import { DEFAULT_ACCENT } from './constants.js';

export async function confirmOverwrite(targetPath: string): Promise<boolean> {
  if (!process.stdin.isTTY) return true;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`File '${targetPath}' already exists. Overwrite? (y/N) `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

export async function executeCompile(
  input: string,
  opts: CliOptions,
): Promise<number> {
  const inputFile = path.resolve(process.cwd(), input);
  const inputDir = path.dirname(inputFile);
  const parsedPath = path.parse(inputFile);
  const stem = parsedPath.name;

  const isSplit = opts.split === true;
  const outputMode = isSplit ? 'split' : 'single';

  let outputPath: string;
  if (opts.output) {
    outputPath = path.resolve(process.cwd(), opts.output);
  } else if (isSplit) {
    outputPath = path.join(inputDir, stem);
  } else {
    outputPath = path.join(inputDir, `${stem}.html`);
  }

  if (fs.existsSync(outputPath) && !opts.force) {
    const allowed = await confirmOverwrite(outputPath);
    if (!allowed) {
      process.stderr.write('Aborted.\n');
      return 0;
    }
  }

  const assetsDir = opts.assetsDir
    ? path.resolve(process.cwd(), opts.assetsDir)
    : path.join(inputDir, 'assets');

  const { logoPath, error: logoErr } = resolveCliLogoPath(opts.logo, inputDir);
  if (logoErr) {
    process.stderr.write(`ERROR: ${logoErr}\n`);
    return 1;
  }

  const options: Options = {
    title: stem,
    assetsDir,
    accent: DEFAULT_ACCENT,
    logo: logoPath,
    inputFile,
    outputPath,
    outputMode,
    noDiagrams: opts.noDiagrams,
    noTables: opts.noTables,
    verbose: opts.verbose,
    minify: opts.minify !== false,
  };

  try {
    const startTime = performance.now();
    const result = compile(options);
    const elapsedMs = Math.round(performance.now() - startTime);

    for (const w of result.warnings) {
      process.stderr.write(`WARN: ${w}\n`);
    }

    if (result.stats) {
      printCompileSummary(result.stats, elapsedMs, outputMode, options.minify);
    }

    return 0;
  } catch (err) {
    reportCliError(err, opts.debug);
    return 1;
  }
}
