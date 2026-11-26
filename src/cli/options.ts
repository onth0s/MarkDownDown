import path from 'node:path';
import type { CliOptions, Options } from '../types.js';
import { resolveCliLogoPath } from '../renderer/logo.js';
import { DEFAULT_ACCENT } from '../constants.js';

export function buildCompileOptions(
  inputFile: string,
  outputPath: string,
  outputMode: 'single' | 'split',
  opts: CliOptions,
): { options?: Options; error?: string } {
  const inputDir = path.dirname(inputFile);
  const stem = path.parse(inputFile).name;

  const assetsDir = opts.assetsDir
    ? path.resolve(process.cwd(), opts.assetsDir)
    : path.join(inputDir, 'assets');

  const { logoPath, error: logoErr } = resolveCliLogoPath(opts.logo, inputDir);
  if (logoErr) {
    return { error: logoErr };
  }

  return {
    options: {
      title: stem,
      assetsDir,
      accent: DEFAULT_ACCENT,
      logo: logoPath,
      inputFile,
      outputPath,
      outputMode,
      noDiagrams: opts.diagrams === false,
      noTables: opts.tables === false,
      verbose: opts.verbose,
      minify: opts.minify !== false,
      allowExternalPaths: opts.allowExternalPaths === true,
    },
  };
}
