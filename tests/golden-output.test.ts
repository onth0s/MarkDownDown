import { compile } from '../src/compile.js';
import type { Options } from '../src/types.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

interface GoldenTarget {
  name: string;
  sourcePath: string;
  assetsDir: string;
  title: string;
  accent: string;
  expectedHash: string;
}

const TARGETS: GoldenTarget[] = [
  {
    name: 'README.md',
    sourcePath: path.resolve(process.cwd(), 'README.md'),
    assetsDir: path.resolve(process.cwd(), 'showcase', 'assets'),
    title: 'Markdown++',
    accent: '#3b82f6',
    expectedHash: '5de34cc5ed3d7d562fe76525e10f768d73c5247604b0093b10cd3561d7f7415d',
  },
  {
    name: 'showcase/showcase.mdd',
    sourcePath: path.resolve(process.cwd(), 'showcase', 'showcase.mdd'),
    assetsDir: path.resolve(process.cwd(), 'showcase', 'assets'),
    title: 'Capability Showcase',
    accent: '#8b5cf6',
    expectedHash: '7e98c4d8f45f77592124e98704649a664c6f5d63248d39b08dfabc8d3deed4ee',
  },
  {
    name: 'tests/fixtures/sample.mdd',
    sourcePath: path.resolve(process.cwd(), 'tests', 'fixtures', 'sample.mdd'),
    assetsDir: path.resolve(process.cwd(), 'tests', 'fixtures'),
    title: 'Sample Document',
    accent: '#3b82f6',
    expectedHash: '2acd8dd0513d9ff653d0e8040156d4eb4e3488c41c421ff8cc9735f0d3c34501',
  },
  {
    name: 'tests/fixtures/download.mdd',
    sourcePath: path.resolve(process.cwd(), 'tests', 'fixtures', 'download.mdd'),
    assetsDir: path.resolve(process.cwd(), 'tests', 'fixtures'),
    title: 'Download Test',
    accent: '#3b82f6',
    expectedHash: '1f527e593545592e92bc1db3a1da2921364642801c875f9fe36289717678d7af',
  },
];

function sha256(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

describe('golden-output regression suite', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdpp-golden-'));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  for (const target of TARGETS) {
    test(`renders ${target.name} byte-for-byte identical to baseline`, () => {
      const outPath = path.join(tmpDir, `${path.basename(target.sourcePath)}.html`);
      const options: Options = {
        inputFile: target.sourcePath,
        outputPath: outPath,
        outputMode: 'single',
        assetsDir: target.assetsDir,
        title: target.title,
        accent: target.accent,
        noDiagrams: false,
        noTables: false,
        verbose: false,
        minify: true,
      };

      const res = compile(options);
      const hash = sha256(res.html);

      expect(hash).toBe(target.expectedHash);
    });
  }
});
