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
import { checkRoundTrip, extractEmbeddedSkeleton } from './pipeline/check.js';

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

    const inputDir = path.dirname(inputFile);
    const parsedPath = path.parse(inputFile);
    const stem = parsedPath.name;

    if (!opts.check && /\.(html|htm)$/i.test(inputFile)) {
      process.stderr.write('ERROR: Input file is an HTML artifact. To compile, provide a .mdd or .md file. To verify roundtrip, run: mdd <artifact.html> --check\n');
      process.exit(1);
    }

    // --check verifies that the original .mdd can be reconstructed from an HTML artifact byte-for-byte.
    if (opts.check) {
      const isHtml = (f: string) => /\.(html|htm)$/i.test(f);
      let htmlFile: string | null = null;
      let sourceFile: string | null = null;
      let htmlContent: string | null = null;
      let rawSource: string | null = null;

      if (sourceArg) {
        const file1 = path.resolve(process.cwd(), input);
        const file2 = path.resolve(process.cwd(), sourceArg);
        if (isHtml(file1) && !isHtml(file2)) {
          htmlFile = file1;
          sourceFile = file2;
        } else if (!isHtml(file1) && isHtml(file2)) {
          htmlFile = file2;
          sourceFile = file1;
        } else {
          process.stderr.write('ERROR: When two files are provided for --check, one must be an HTML artifact (.html) and the other a Markdown source (.mdd / .md).\n');
          process.exit(1);
        }
      } else if (isHtml(inputFile)) {
        htmlFile = inputFile;
        htmlContent = fs.readFileSync(htmlFile, 'utf8');
        const skeleton = extractEmbeddedSkeleton(htmlContent);
        if (!skeleton) {
          process.stderr.write(`ERROR: HTML artifact does not contain an embedded #mdd-skeleton payload: ${htmlFile}\n`);
          process.exit(1);
        }
        let sourceName: string | undefined;
        try {
          const m = htmlContent.match(/<script type="application\/json" id="mdd-skeleton">([\s\S]*?)<\/script>/i);
          if (m) sourceName = (JSON.parse(m[1]) as { name?: string }).name;
        } catch { /* malformed skeleton payload */ }

        const candidates: string[] = [];
        if (sourceName) {
          candidates.push(path.resolve(path.dirname(htmlFile), sourceName));
          candidates.push(path.resolve(path.dirname(htmlFile), sourceName.replace(/\.mdd$/i, '.md')));
          candidates.push(path.resolve(path.dirname(htmlFile), sourceName.replace(/\.md$/i, '.mdd')));
          candidates.push(path.resolve(process.cwd(), sourceName));
        }
        candidates.push(path.resolve(path.dirname(htmlFile), `${stem}.mdd`));
        candidates.push(path.resolve(process.cwd(), `${stem}.mdd`));
        candidates.push(path.resolve(path.dirname(htmlFile), `${stem}.md`));
        candidates.push(path.resolve(process.cwd(), `${stem}.md`));

        for (const c of candidates) {
          if (fs.existsSync(c)) {
            sourceFile = c;
            break;
          }
        }
        if (!sourceFile) {
          process.stderr.write(`ERROR: Original source file not found to compare against.\nSearched candidates:\n  ${candidates.join('\n  ')}\nSpecify the source file explicitly: mdd ${input} <source.mdd> --check\n`);
          process.exit(1);
        }
      } else {
        sourceFile = inputFile;
        // Check if an existing on-disk HTML artifact exists to check against
        const candidates: string[] = [];
        if (opts.output && isHtml(opts.output)) {
          candidates.push(path.resolve(process.cwd(), opts.output));
        }
        candidates.push(path.resolve(inputDir, `${stem}.html`));
        candidates.push(path.resolve(process.cwd(), `${stem}.html`));
        for (const c of candidates) {
          if (fs.existsSync(c)) {
            htmlFile = c;
            break;
          }
        }
      }

      if (sourceFile && !rawSource) {
        if (!fs.existsSync(sourceFile)) {
          process.stderr.write(`ERROR: Source file not found: ${sourceFile}\n`);
          process.exit(1);
        }
        rawSource = fs.readFileSync(sourceFile, 'utf8');
      }

      if (htmlFile && !htmlContent) {
        if (!fs.existsSync(htmlFile)) {
          process.stderr.write(`ERROR: HTML artifact not found: ${htmlFile}\n`);
          process.exit(1);
        }
        htmlContent = fs.readFileSync(htmlFile, 'utf8');
      }

      try {
        if (!htmlContent) {
          // If no artifact on disk, compile in memory
          const checkOptions: Options = {
            title: stem,
            assetsDir: path.join(inputDir, 'assets'),
            accent: '#3b82f6',
            inputFile: sourceFile!,
            outputPath: path.join(inputDir, `${stem}.html`),
            outputMode: 'single',
            noDiagrams: opts.noDiagrams,
            noTables: opts.noTables,
            verbose: false,
            minify: opts.minify !== false,
          };
          const compiled = compile(checkOptions);
          for (const w of compiled.warnings) process.stderr.write(`WARN: ${w}\n`);
          htmlContent = compiled.html;
        }

        const skeleton = extractEmbeddedSkeleton(htmlContent);
        const result = checkRoundTrip({
          md: createMarkdownParser(),
          html: htmlContent,
          rawSource: rawSource!,
          skeletonText: skeleton ? JSON.stringify(skeleton) : undefined,
        });

        const relSource = sourceFile ? (path.relative(process.cwd(), sourceFile) || sourceFile) : inputFile;
        const relHtml = htmlFile ? (path.relative(process.cwd(), htmlFile) || htmlFile) : '(in-memory compiled artifact)';
        process.stdout.write(`\n Markdown++ Round-Trip Check\n`);
        process.stdout.write(` --------------------------------\n`);
        process.stdout.write(` Source:      ${relSource}\n`);
        process.stdout.write(` Artifact:    ${relHtml}\n`);
        process.stdout.write(` ${result.message}\n`);
        if (!result.semanticEqual && result.firstDiff) {
          const d = result.firstDiff;
          process.stdout.write(`\n First semantic difference at line ${d.line}:\n`);
          if (opts.verbose) {
            process.stdout.write(`   source:  ${JSON.stringify(d.source)}\n`);
            process.stdout.write(`   rebuilt: ${JSON.stringify(d.rebuilt)}\n`);
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

