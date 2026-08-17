#!/usr/bin/env node
/**
 * Markdown++ CLI entry point.
 */
import { Command } from 'commander';
import path from 'node:path';
import fs from 'node:fs';
import { compile } from './compile.js';
import type { Options } from './types.js';

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
  .action(async (input: string, opts: Record<string, unknown>) => {
    // Resolve input path
    const inputFile = path.resolve(process.cwd(), input);
    if (!fs.existsSync(inputFile)) {
      process.stderr.write(`ERROR: Input file not found: ${inputFile}\n`);
      process.exit(1);
    }

    const inputDir = path.dirname(inputFile);
    const stem = path.basename(inputFile, path.extname(inputFile));

    // Output mode: --single takes precedence; default is --split
    const outputMode: 'single' | 'split' = opts['single'] ? 'single' : 'split';

    // Default output path
    let outputPath: string;
    if (opts['output']) {
      outputPath = path.resolve(process.cwd(), opts['output'] as string);
    } else if (outputMode === 'single') {
      outputPath = path.join(inputDir, `${stem}.html`);
    } else {
      outputPath = path.join(inputDir, stem);
    }

    // Default assets dir
    const assetsDir = opts['assetsDir']
      ? path.resolve(process.cwd(), opts['assetsDir'] as string)
      : path.join(inputDir, 'assets');

    const options: Options = {
      title: stem,                        // frontmatter overrides this
      assetsDir,
      accent: '#3b82f6',                  // frontmatter overrides this
      inputFile,
      outputPath,
      outputMode,
      noDiagrams: !!(opts['noDiagrams'] as boolean),
      noTables: !!(opts['noTables'] as boolean),
      verbose: !!(opts['verbose'] as boolean),
    };

    try {
      const result = await compile(options);
      if (result.warnings.length > 0) {
        for (const w of result.warnings) {
          process.stderr.write(`WARN: ${w}\n`);
        }
      }
      process.exit(0);
    } catch (err) {
      process.stderr.write(`ERROR: ${(err as Error).message}\n`);
      process.exit(1);
    }
  });

program.parseAsync(process.argv);
