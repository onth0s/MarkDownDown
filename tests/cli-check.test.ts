import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

describe('CLI --check artifact and source ratification', () => {
  const cli = path.resolve('dist', 'cli.cjs');

  test('mdd <artifact.html> --check verifies source recovery from disk artifact', () => {
    const out = execFileSync('node', [cli, 'showcase/showcase.html', '--check'], { encoding: 'utf8' });
    expect(out).toContain('Source:');
    expect(out).toContain('Artifact:');
    expect(out).toContain('showcase.mdd');
    expect(out).toContain('showcase.html');
    expect(out).toContain('byte PASS');
    expect(out).toContain('SEMANTIC: PASS');
    expect(out).toContain('Result:     PASS');
  });

  test('mdd <artifact.html> <source.mdd> --check verifies explicitly passed files', () => {
    const out = execFileSync('node', [cli, 'showcase/showcase.html', 'showcase/showcase.mdd', '--check'], { encoding: 'utf8' });
    expect(out).toContain('byte PASS');
    expect(out).toContain('Result:     PASS');
  });

  test('mdd <source.mdd> <artifact.html> --check works with inverted argument order', () => {
    const out = execFileSync('node', [cli, 'showcase/showcase.mdd', 'showcase/showcase.html', '--check'], { encoding: 'utf8' });
    expect(out).toContain('byte PASS');
    expect(out).toContain('Result:     PASS');
  });

  test('mdd <source.mdd> --check discovers and ratifies the on-disk HTML artifact', () => {
    const out = execFileSync('node', [cli, 'showcase/showcase.mdd', '--check'], { encoding: 'utf8' });
    expect(out).toContain('Artifact:');
    expect(out).toContain('showcase.html');
    expect(out).toContain('byte PASS');
    expect(out).toContain('Result:     PASS');
  });

  test('mdd index.html --check automatically discovers and ratifies README.md', () => {
    const out = execFileSync('node', [cli, 'index.html', '--check'], { encoding: 'utf8' });
    expect(out).toContain('Source:');
    expect(out).toContain('README.md');
    expect(out).toContain('byte PASS');
    expect(out).toContain('Result:     PASS');
  });

  test('mdd <source.mdd> --check compiles in memory and does not write an HTML artifact to disk', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdpp-check-isolated-'));
    try {
      const srcFile = path.join(tmpDir, 'isolated.mdd');
      fs.writeFileSync(srcFile, '# Isolated Document\n\nPure verification with no disk side effect.\n', 'utf8');

      const out = execFileSync('node', [cli, srcFile, '--check'], { encoding: 'utf8' });
      expect(out).toContain('(in-memory compiled artifact)');
      expect(out).toContain('Result:     PASS');

      const expectedHtml = path.join(tmpDir, 'isolated.html');
      expect(fs.existsSync(expectedHtml)).toBe(false);
      expect(fs.readdirSync(tmpDir)).toEqual(['isolated.mdd']);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
