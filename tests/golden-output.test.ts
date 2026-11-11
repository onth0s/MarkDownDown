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
    expectedHash: '657cdce0ae42b6a2212ae854dc85e230f376179bf18e4f8357b55e47a4e4587d',
  },
  {
    name: 'showcase/showcase.mdd',
    sourcePath: path.resolve(process.cwd(), 'showcase', 'showcase.mdd'),
    assetsDir: path.resolve(process.cwd(), 'showcase', 'assets'),
    title: 'Capability Showcase',
    accent: '#8b5cf6',
    expectedHash: 'fe0e4b72a30951aec36d9038422862ad196820d824b9d0771b3ccd5b1575e2b7',
  },
  {
    name: 'tests/fixtures/sample.mdd',
    sourcePath: path.resolve(process.cwd(), 'tests', 'fixtures', 'sample.mdd'),
    assetsDir: path.resolve(process.cwd(), 'tests', 'fixtures'),
    title: 'Sample Document',
    accent: '#3b82f6',
    expectedHash: '590885c666b4f26988e70078275059fff842c00ab8443e2b4df3969b00a212c2',
  },
  {
    name: 'tests/fixtures/download.mdd',
    sourcePath: path.resolve(process.cwd(), 'tests', 'fixtures', 'download.mdd'),
    assetsDir: path.resolve(process.cwd(), 'tests', 'fixtures'),
    title: 'Download Test',
    accent: '#3b82f6',
    expectedHash: '9c285980e8883698f5c1a7b3935b3e4653e6c21a2de21fdba769c1b91bd1a61a',
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
