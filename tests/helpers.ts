import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Options } from '../src/types.js';
import { DEFAULT_ACCENT } from '../src/constants.js';

/** Create an isolated temp directory, run `fn`, and clean up in `finally`. */
export async function withTmpDir<T>(prefix: string, fn: (dir: string) => T | Promise<T>): Promise<T> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Canonical Options factory for tests. */
export function makeOptions(overrides: Partial<Options> & { inputFile: string; outputPath: string }): Options {
  return {
    title: 'Test Document',
    assetsDir: path.join(path.dirname(overrides.inputFile), 'assets'),
    accent: DEFAULT_ACCENT,
    outputMode: 'single',
    noDiagrams: false,
    noTables: false,
    verbose: false,
    minify: true,
    ...overrides,
  };
}
