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
import { CompileError, toErrorMessage } from './util/error.js';
import { SPEC } from './spec.js';
import { createMarkdownParser } from './parser/markdown.js';
import { checkRoundTrip } from './pipeline/check.js';

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
  .option('--no-tables', 'Skip table SVG rendering')
  .option('--minify', 'Minify CSS/JS/HTML in monolithic export (default)', true)
  .option('--no-minify', 'Disable minification in monolithic export')
  .option('-L, --logo [path]', 'Custom SVG or image brand logo and favicon (auto-detects if single .svg exists in working dir)')
  .option('-F, --force', 'Force overwrite without confirmation prompt', false)
  .option('--check', 'Verify the .mdd can be recovered from the rendered HTML, then exit', false)
  .option('-v, --verbose', 'Verbose output', false)
  .option('--debug', 'Dump full error stack traces on failure', false)
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

    const inputDir = path.dirname(inputFile);
    const parsedPath = path.parse(inputFile);
    const stem = parsedPath.name;

    // --check compiles in memory, verifies the round-trip, and writes nothing.
    if (opts.check) {
      const rawSource = fs.readFileSync(inputFile, 'utf8');
      const checkOptions: Options = {
        title: stem,
        assetsDir: path.join(inputDir, 'assets'),
        accent: '#3b82f6',
        inputFile,
        outputPath: path.join(inputDir, `${stem}.html`),
        outputMode: 'single',
        noDiagrams: opts.noDiagrams,
        noTables: opts.noTables,
        verbose: false,
        minify: opts.minify !== false,
      };
      try {
        const compiled = compile(checkOptions);
        for (const w of compiled.warnings) process.stderr.write(`WARN: ${w}\n`);

        const result = checkRoundTrip({
          md: createMarkdownParser(),
          html: compiled.html,
          rawSource,
        });

        const relInput = path.relative(process.cwd(), inputFile) || inputFile;
        process.stdout.write(`\n Markdown++ Round-Trip Check\n`);
        process.stdout.write(` --------------------------------\n`);
        process.stdout.write(` Source:      ${relInput}\n`);
        process.stdout.write(` ${result.message}\n`);
        if (!result.semanticEqual && result.firstDiff) {
          const d = result.firstDiff;
          process.stdout.write(`\n First semantic difference at line ${d.line}:\n`);
          if (opts.verbose) {
            process.stdout.write(`   source:  ${JSON.stringify(d.source)}\n`);
            process.stdout.write(`   rebuilt: ${JSON.stringify(d.rebuilt)}\n`);
            // Show the first differing character position for precision.
            let i = 0;
            while (i < d.source.length && i < d.rebuilt.length && d.source[i] === d.rebuilt[i]) i++;
            process.stdout.write(`   diverges at char ${i}:\n`);
            process.stdout.write(`     source  ...${JSON.stringify(d.source.slice(Math.max(0, i - 40), i + 40))}\n`);
            process.stdout.write(`     rebuilt ...${JSON.stringify(d.rebuilt.slice(Math.max(0, i - 40), i + 40))}\n`);
          } else {
            process.stdout.write(`   source:  ${JSON.stringify(d.source.slice(0, 160))}\n`);
            process.stdout.write(`   rebuilt: ${JSON.stringify(d.rebuilt.slice(0, 160))}\n`);
            process.stdout.write(`   (re-run with -v for the exact divergence)\n`);
          }
        }
        process.stdout.write(`\n Result:     ${result.ok ? 'PASS' : 'FAIL'}\n\n`);
        process.exit(result.ok ? 0 : 1);
      } catch (err) {
        if (err instanceof CompileError) {
          process.stderr.write(`ERROR: ${err.message}\n`);
          if (opts.debug) process.stderr.write(`${err.stack}\n`);
        } else {
          process.stderr.write(`ERROR: ${toErrorMessage(err)}\n`);
          if (opts.debug && err instanceof Error) process.stderr.write(`${err.stack}\n`);
        }
        process.exit(1);
      }
    }

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
        process.exit(0);
      }
    }

    const assetsDir = opts.assetsDir
      ? path.resolve(process.cwd(), opts.assetsDir)
      : path.join(inputDir, 'assets');

    let logoPath: string | undefined;
    if (typeof opts.logo === 'string') {
      logoPath = path.resolve(process.cwd(), opts.logo);
    } else if (opts.logo === true) {
      // Auto-detect single .svg in current working directory first, then input directory
      const findSingleSvg = (dir: string): string | null => {
        try {
          const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.svg'));
          if (files.length === 1) return path.join(dir, files[0]);
        } catch {
          // ignore
        }
        return null;
      };

      const cwdSvg = findSingleSvg(process.cwd());
      const inputDirSvg = findSingleSvg(inputDir);

      if (cwdSvg) {
        logoPath = cwdSvg;
      } else if (inputDirSvg) {
        logoPath = inputDirSvg;
      } else {
        const cwdSvgs = fs.readdirSync(process.cwd()).filter(f => f.toLowerCase().endsWith('.svg'));
        if (cwdSvgs.length > 1) {
          process.stderr.write(`ERROR: Multiple .svg files found in working directory. Please specify path: -L <path>\n`);
          process.exit(1);
        } else {
          process.stderr.write(`ERROR: -L flag passed with no argument, but no .svg file was found in working directory or input directory.\n`);
          process.exit(1);
        }
      }
    }

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
        if (result.stats.mirrorBlocks && result.stats.mirrorBlocks > 0) {
          process.stdout.write(` Mirror:      ${result.stats.mirrorBlocks} blocks (${result.stats.mirrorItems ?? 0} items, ${result.stats.mirrorProbes ?? 0} probes)\n`);
        }
        process.stdout.write(` Frontmatter: ${frontmatterKeys} entries\n`);
        process.stdout.write(` Mode:        ${outputMode} (${options.minify ? 'minified' : 'unminified'})\n`);
        process.stdout.write(` Output:      ${relOutput} (${sizeFormatted})\n`);
        process.stdout.write(` Time:        ${elapsedMs}ms\n\n`);
      }

      process.exit(0);
    } catch (err) {
      if (err instanceof CompileError) {
        process.stderr.write(`ERROR: ${err.message}\n`);
        if (opts.debug) process.stderr.write(`${err.stack}\n`);
      } else {
        process.stderr.write(`ERROR: ${toErrorMessage(err)}\n`);
        if (opts.debug && err instanceof Error) process.stderr.write(`${err.stack}\n`);
      }
      process.exit(1);
    }
  });

program.parse(process.argv);

