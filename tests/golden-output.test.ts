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
    expectedHash: '0e0341e9b0ba72517e95451aff9fc5eeb73f3c67b8cb95f0881d7328b7074f27',
  },
  {
    name: 'showcase/showcase.mdd',
    sourcePath: path.resolve(process.cwd(), 'showcase', 'showcase.mdd'),
    assetsDir: path.resolve(process.cwd(), 'showcase', 'assets'),
    title: 'Capability Showcase',
    accent: '#8b5cf6',
    expectedHash: '9df226a69fb793661b97719a3b55ddd6d4a2b3813db3d7e21e01b0916c25fdb1',
  },
  {
    name: 'tests/fixtures/sample.mdd',
    sourcePath: path.resolve(process.cwd(), 'tests', 'fixtures', 'sample.mdd'),
    assetsDir: path.resolve(process.cwd(), 'tests', 'fixtures'),
    title: 'Sample Document',
    accent: '#3b82f6',
    expectedHash: '1d586ebca190a6b6d2faa41c6558693538533a16099e1accaf1f9b51162c47c3',
  },
  {
    name: 'tests/fixtures/download.mdd',
    sourcePath: path.resolve(process.cwd(), 'tests', 'fixtures', 'download.mdd'),
    assetsDir: path.resolve(process.cwd(), 'tests', 'fixtures'),
    title: 'Download Test',
    accent: '#3b82f6',
    expectedHash: '0c82864560dda6623649341b8c254fa875f84151e263da3e0f48510b2cfad001',
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

      // Enforce on-disk freshness for tracked compiled artifacts
      if (target.name === 'README.md') {
        const onDisk = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');
        expect(sha256(onDisk)).toBe(hash);
      } else if (target.name === 'showcase/showcase.mdd') {
        const onDisk = fs.readFileSync(path.resolve(process.cwd(), 'showcase', 'showcase.html'), 'utf8');
        expect(sha256(onDisk)).toBe(hash);
      }
    });
  }
});
