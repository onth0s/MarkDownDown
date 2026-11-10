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
    expectedHash: '01bddeae07d5f1eea9351411b091ea116b6f3f94ded044943e2ff8438fa59e27',
  },
  {
    name: 'showcase/showcase.mdd',
    sourcePath: path.resolve(process.cwd(), 'showcase', 'showcase.mdd'),
    assetsDir: path.resolve(process.cwd(), 'showcase', 'assets'),
    title: 'Capability Showcase',
    accent: '#8b5cf6',
    expectedHash: '17b47281dae462950f95a92171f92c621553b359d580951e1b858f95d8d90fa3',
  },
  {
    name: 'tests/fixtures/sample.mdd',
    sourcePath: path.resolve(process.cwd(), 'tests', 'fixtures', 'sample.mdd'),
    assetsDir: path.resolve(process.cwd(), 'tests', 'fixtures'),
    title: 'Sample Document',
    accent: '#3b82f6',
    expectedHash: '2cf9a838959e5f1389c0ac06be64783d464b9df999bc6801fadd241358347c71',
  },
  {
    name: 'tests/fixtures/download.mdd',
    sourcePath: path.resolve(process.cwd(), 'tests', 'fixtures', 'download.mdd'),
    assetsDir: path.resolve(process.cwd(), 'tests', 'fixtures'),
    title: 'Download Test',
    accent: '#3b82f6',
    expectedHash: 'c1e03c480a159c7edd77fa91f66fb38e258a0561bd22ef113679f4a2931292b7',
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
