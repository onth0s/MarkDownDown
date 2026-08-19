#!/usr/bin/env node
/**
 * Markdown++ CLI entry point.
 */
import { Command } from 'commander';
import path from 'node:path';
import fs from 'node:fs';
import readline from 'node:readline';
import { compile } from './compile.js';
import type { Options, CliOptions } from './types.js';
import { toErrorMessage } from './util/error.js';
import { SPEC } from './spec.js';

async function confirmOverwrite(targetPath: string): Promise<boolean> {
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

const program = new Command();

program
  .name('mdd')
  .description('Compile .mdd / .md files to interactive HTML documents')
  .version('0.1.0')
  .argument('[input]', 'Input .mdd or .md file')
  .option('--spec', 'Print the full MD++ language specification and exit')
  .option('-o, --output <path>', 'Output file (single) or directory (split)')
  .option('--single', 'Single self-contained HTML (default)', true)
  .option('--split', 'Separate CSS/JS/assets', false)
  .option('--assets-dir <path>', 'Assets directory (default: ./assets/ relative to input)')
  .option('--no-diagrams', 'Skip diagram SVG rendering')
  .option('--minify', 'Minify CSS/JS/HTML in monolithic export (default)', true)
  .option('--no-minify', 'Disable minification in monolithic export')
  .option('-L, --logo <path>', 'Custom SVG or image brand logo and favicon')
  .option('-F, --force', 'Force overwrite without confirmation prompt', false)
  .option('-v, --verbose', 'Verbose output', false)
  .action(async (input: string | undefined, opts: CliOptions) => {
    if (opts.spec) {
      process.stdout.write(SPEC);
      process.exit(0);
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

    const ext = path.extname(inputFile).toLowerCase();
    if (ext !== '.mdd' && ext !== '.md' && ext !== '.markdown') {
      process.stderr.write(`ERROR: Input file is not a supported Markdown file (.mdd, .md, .markdown): ${inputFile}\n`);
      process.exit(1);
    }

    const inputDir = path.dirname(inputFile);
    const stem = path.basename(inputFile, path.extname(inputFile));

    const outputMode: 'single' | 'split' = opts.split ? 'split' : 'single';

    let outputPath: string;
    if (opts.output) {
      outputPath = path.resolve(process.cwd(), opts.output);
    } else if (outputMode === 'single') {
      outputPath = path.join(inputDir, `${stem}.html`);
    } else {
      outputPath = path.join(inputDir, stem);
    }

    // Overwrite confirmation
    const targetToCheck = outputMode === 'single'
      ? (outputPath.endsWith('.html') ? outputPath : outputPath + '.html')
      : outputPath;

    if (fs.existsSync(targetToCheck) && !opts.force) {
      const allowed = await confirmOverwrite(targetToCheck);
      if (!allowed) {
        process.stderr.write('Aborted.\n');
        process.exit(0);
      }
    }

    const assetsDir = opts.assetsDir
      ? path.resolve(process.cwd(), opts.assetsDir)
      : path.join(inputDir, 'assets');

    const logoPath = opts.logo ? path.resolve(process.cwd(), opts.logo) : undefined;

    const options: Options = {
      title: stem,
      assetsDir,
      accent: '#3b82f6',
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
        const { sections, wikilinks, frontmatterKeys, title, accent, outputFile, sizeBytes } = result.stats;
        const relOutput = path.relative(process.cwd(), outputFile) || outputFile;
        const sizeFormatted = sizeBytes >= 1024 * 1024
          ? `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`
          : `${(sizeBytes / 1024).toFixed(1)} KB`;

        process.stdout.write(`\n Markdown++ Compile Summary\n`);
        process.stdout.write(` ---------------------------\n`);
        process.stdout.write(` Title:       ${title}\n`);
        process.stdout.write(` Accent:      ${accent}\n`);
        if (result.stats.logo) {
          const relLogo = path.relative(process.cwd(), result.stats.logo) || result.stats.logo;
          process.stdout.write(` Logo:        ${relLogo}\n`);
        }
        process.stdout.write(` Sections:    ${sections}\n`);
        process.stdout.write(` Wikilinks:   ${wikilinks}\n`);
        process.stdout.write(` Frontmatter: ${frontmatterKeys} entries\n`);
        process.stdout.write(` Mode:        ${outputMode} (${options.minify ? 'minified' : 'unminified'})\n`);
        process.stdout.write(` Output:      ${relOutput} (${sizeFormatted})\n`);
        process.stdout.write(` Time:        ${elapsedMs}ms\n\n`);
      }

      process.exit(0);
    } catch (err) {
      process.stderr.write(`ERROR: ${toErrorMessage(err)}\n`);
      process.exit(1);
    }
  });

program.parse(process.argv);

