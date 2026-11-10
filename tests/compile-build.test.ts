import { build, compile, compileToDisk } from '../src/compile.js';
import type { Options } from '../src/types.js';
import { CompileError } from '../src/util/error.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Pure build vs compileToDisk', () => {
  let tmpDir: string;
  const samplePath = path.resolve(process.cwd(), 'tests', 'fixtures', 'sample.mdd');
  const sampleAssets = path.resolve(process.cwd(), 'tests', 'fixtures');

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdpp-compile-build-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeOpts(overrides: Partial<Options> = {}): Options {
    return {
      inputFile: samplePath,
      outputPath: path.join(tmpDir, 'out.html'),
      outputMode: 'single',
      title: 'Sample Document',
      assetsDir: sampleAssets,
      accent: '#3b82f6',
      noDiagrams: false,
      noTables: false,
      verbose: false,
      ...overrides,
    };
  }

  test('build compiles in memory without writing any files to disk', () => {
    const outPath = path.join(tmpDir, 'nonexistent_output.html');

    const result = build(makeOpts({ outputPath: outPath }));

    expect(result.html).toBeTruthy();
    expect(result.html).toContain('<!doctype html>');
    expect(result.stats!.sections).toBeGreaterThan(0);
    expect(result.stats!.frontmatterKeys).toBeGreaterThan(0);
    expect(result.warnings).toBeInstanceOf(Array);
    expect(result.assembled).toBeDefined();

    // Verify nothing was written to disk
    expect(fs.existsSync(outPath)).toBe(false);
    expect(fs.readdirSync(tmpDir)).toHaveLength(0);
  });

  test('build supports split mode in memory and populates assembled css and js', () => {
    const outPath = path.join(tmpDir, 'site');

    const result = build(makeOpts({ outputPath: outPath, outputMode: 'split' }));

    expect(result.html).toBeTruthy();
    expect(result.assembled.css).toBeTruthy();
    expect(result.assembled.js).toBeTruthy();
    expect(result.assembled.css).toContain(':root');
    expect(result.assembled.js).toContain('use strict');
    expect(fs.existsSync(outPath)).toBe(false);
  });

  test('compileToDisk writes HTML output to disk', () => {
    const outPath = path.join(tmpDir, 'output.html');

    const result = compileToDisk(makeOpts({ outputPath: outPath }));

    expect(result.html).toBeTruthy();
    expect(fs.existsSync(outPath)).toBe(true);
    expect(fs.readFileSync(outPath, 'utf8')).toBe(result.html);
  });

  test('compile alias delegates to compileToDisk and writes to disk', () => {
    const outPath = path.join(tmpDir, 'aliased.html');

    const result = compile(makeOpts({ outputPath: outPath }));

    expect(result.html).toBeTruthy();
    expect(fs.existsSync(outPath)).toBe(true);
  });

  test('build throws CompileError on invalid accent color', () => {
    expect(() => {
      build(makeOpts({ rawSource: '# No Frontmatter', accent: 'invalid-accent-color' }));
    }).toThrow(CompileError);
  });
});
