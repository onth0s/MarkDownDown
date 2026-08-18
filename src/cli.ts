#!/usr/bin/env node
/**
 * Markdown++ CLI entry point.
 */
import { Command } from 'commander';
import path from 'node:path';
import fs from 'node:fs';
import { compile } from './compile.js';
import type { Options, CliOptions } from './types.js';
import { toErrorMessage } from './util/error.js';

const program = new Command();

program
  .name('markdown++')
  .description('Compile .mdd files to interactive HTML documents')
  .version('0.1.0')
  .argument('<input>', 'Input .mdd file')
  .option('-o, --output <path>', 'Output file (--single) or directory (--split)')
  .option('--single', 'Single self-contained HTML (all inlined)', false)
  .option('--split', 'Separate CSS/JS/assets (default)', false)
  .option('--assets-dir <path>', 'Assets directory (default: ./assets/ relative to input)')
  .option('--no-diagrams', 'Skip diagram SVG rendering')
  .option('--no-tables', 'Skip table SVG rendering')
  .option('-v, --verbose', 'Verbose output', false)
    .action((input: string, opts: CliOptions) => {
    const inputFile = path.resolve(process.cwd(), input);
    if (!fs.existsSync(inputFile)) {
      process.stderr.write(`ERROR: Input file not found: ${inputFile}\n`);
      process.exit(1);
    }

    if (!inputFile.endsWith('.mdd')) {
      process.stderr.write(`WARN: Input file does not have .mdd extension: ${inputFile}\n`);
    }

    const inputDir = path.dirname(inputFile);
    const stem = path.basename(inputFile, path.extname(inputFile));

    const outputMode: 'single' | 'split' = opts.single ? 'single' : 'split';

    let outputPath: string;
    if (opts.output) {
      outputPath = path.resolve(process.cwd(), opts.output);
    } else if (outputMode === 'single') {
      outputPath = path.join(inputDir, `${stem}.html`);
    } else {
      outputPath = path.join(inputDir, stem);
    }

    const assetsDir = opts.assetsDir
      ? path.resolve(process.cwd(), opts.assetsDir)
      : path.join(inputDir, 'assets');

    const options: Options = {
      title: stem,
      assetsDir,
      accent: '#3b82f6',
      inputFile,
      outputPath,
      outputMode,
      noDiagrams: opts.noDiagrams,
      noTables: opts.noTables,
      verbose: opts.verbose,
    };

    try {
      const result = compile(options);
      for (const w of result.warnings) {
        process.stderr.write(`WARN: ${w}\n`);
      }
      process.exit(0);
    } catch (err) {
      process.stderr.write(`ERROR: ${toErrorMessage(err)}\n`);
      process.exit(1);
    }
  });

program.parse(process.argv);
