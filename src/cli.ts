#!/usr/bin/env node
/**
 * Markdown++ CLI entry point.
 */
import { Command } from 'commander';
import path from 'node:path';
import fs from 'node:fs';
import type { CliOptions } from './types.js';
import { SPEC } from './spec.js';
import { executeCheck } from './cli/run-check.js';
import { executeCompile } from './cli/run-compile.js';

declare const __VERSION__: string | undefined;
const CLI_VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : '0.1.0';

const program = new Command();

program
  .name('mdd')
  .description('Compile .mdd / .md files to interactive HTML documents')
  .version(CLI_VERSION)
  .argument('[input]', 'Input .mdd, .md, or compiled .html file')
  .argument('[source]', 'Optional source .mdd or .md file when checking an .html artifact')
  .option('--spec', 'Print the full MD++ language specification and exit')
  .option('-o, --output <path>', 'Output file (single) or directory (split)')
  .option('--single', 'Single self-contained HTML (default)', true)
  .option('--split', 'Separate CSS/JS/assets', false)
  .option('--assets-dir <path>', 'Assets directory (default: ./assets/ relative to input)')
  .option('--no-diagrams', 'Skip diagram SVG rendering')
  .option('--no-tables', 'Skip table SVG rendering')
  .option('--minify', 'Minify CSS/JS/HTML in monolithic export (default)', true)
  .option('--no-minify', 'Disable minification in monolithic export')
  .option('-L, --logo [path]', 'Custom SVG or image brand logo and favicon (auto-detects if single .svg exists in working dir)')
  .option('-F, --force', 'Force overwrite without confirmation prompt', false)
  .option('--check', 'Verify the .mdd can be recovered from the rendered HTML, then exit', false)
  .option('-v, --verbose', 'Verbose output', false)
  .option('--debug', 'Dump full error stack traces on failure', false)
  .action(async (input: string | undefined, sourceArg: string | undefined, opts: CliOptions) => {
    if (opts.spec) {
      process.stdout.write(SPEC);
      process.exit(0);
    }

    if (!opts.check && sourceArg) {
      process.stderr.write('ERROR: Multiple input files are only supported with --check: mdd <artifact.html> <source.mdd> --check\n');
      process.exit(1);
    }

    if (!input) {
      process.stderr.write('ERROR: No input file specified. Use mdd <input.mdd> or mdd --spec.\n');
      process.exit(1);
    }

    const inputFile = path.resolve(process.cwd(), input);
    if (!fs.existsSync(inputFile)) {
      process.stderr.write(`ERROR: Input file not found: ${inputFile}\n`);
      process.exit(1);
    }

    if (!opts.check && /\.(html|htm)$/i.test(inputFile)) {
      process.stderr.write('ERROR: Input file is an HTML artifact. To compile, provide a .mdd or .md file. To verify roundtrip, run: mdd <artifact.html> --check\n');
      process.exit(1);
    }

    const exitCode = opts.check
      ? executeCheck(input, sourceArg, opts)
      : await executeCompile(input, opts);

    process.exit(exitCode);
  });

program.parse(process.argv);
