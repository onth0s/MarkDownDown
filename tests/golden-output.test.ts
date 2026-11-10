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
    expectedHash: 'f0b5f2f05a9c61b0986dac742adeef1d8bac0daef9ee0ce5ac3201a97a424020',
  },
  {
    name: 'showcase/showcase.mdd',
    sourcePath: path.resolve(process.cwd(), 'showcase', 'showcase.mdd'),
    assetsDir: path.resolve(process.cwd(), 'showcase', 'assets'),
    title: 'Capability Showcase',
    accent: '#8b5cf6',
    expectedHash: '70fa3d8394fe946a2a4da8b6e2e6378a2acba8c9d6d37fba8b11d4d3b9221764',
  },
  {
    name: 'tests/fixtures/sample.mdd',
    sourcePath: path.resolve(process.cwd(), 'tests', 'fixtures', 'sample.mdd'),
    assetsDir: path.resolve(process.cwd(), 'tests', 'fixtures'),
    title: 'Sample Document',
    accent: '#3b82f6',
    expectedHash: 'e4df448bc4db2d1f2a1a1a43f1cc38451621a7af8afc64b368a58947daee040a',
  },
  {
    name: 'tests/fixtures/download.mdd',
    sourcePath: path.resolve(process.cwd(), 'tests', 'fixtures', 'download.mdd'),
    assetsDir: path.resolve(process.cwd(), 'tests', 'fixtures'),
    title: 'Download Test',
    accent: '#3b82f6',
    expectedHash: '87d9fb32a2257a9f5dfbddb47153a403e99147c26b4189cf576a45d1497169eb',
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
