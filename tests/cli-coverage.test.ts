import fs from 'node:fs';
import path from 'node:path';
import { executeCompile } from '../src/cli/run-compile.js';
import { executeCheck } from '../src/cli/run-check.js';
import type { CliOptions } from '../src/types.js';
import { withTmpDir } from './helpers.js';

function baseCliOpts(overrides: Partial<CliOptions> = {}): CliOptions {
  return {
    single: true,
    split: false,
    diagrams: true,
    tables: true,
    verbose: false,
    force: true,
    minify: true,
    ...overrides,
  };
}

describe('CLI executeCompile and executeCheck runtime coverage', () => {
  test('executeCompile compiles single HTML and respects --no-diagrams and --no-tables', async () => {
    await withTmpDir('mdpp-cli-comp-', async (dir) => {
      const src = path.join(dir, 'doc.mdd');
      const out = path.join(dir, 'doc.html');
      fs.writeFileSync(
        src,
        '# Title\n\n```diagram\nA -> B\n```\n\n```table\n| A | B |\n| 1 | 2 |\n```\n',
        'utf8',
      );

      const code = await executeCompile(src, baseCliOpts({ output: out, diagrams: false, tables: false }));
      expect(code).toBe(0);
      const html = fs.readFileSync(out, 'utf8');
      expect(html).not.toContain('class="diagram-svg"');
      expect(html).not.toContain('class="table-svg"');
    });
  });

  test('executeCompile supports --split mode and writes style.css + app.js', async () => {
    await withTmpDir('mdpp-cli-split-', async (dir) => {
      const src = path.join(dir, 'split.mdd');
      const outDir = path.join(dir, 'site');
      fs.writeFileSync(src, '# Split\n\nHello world.\n', 'utf8');

      const code = await executeCompile(src, baseCliOpts({ single: false, split: true, output: outDir }));
      expect(code).toBe(0);
      expect(fs.existsSync(path.join(outDir, 'split.html'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'style.css'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'app.js'))).toBe(true);
    });
  });

  test('executeCheck verifies a freshly compiled HTML artifact against its source', async () => {
    await withTmpDir('mdpp-cli-chk-', async (dir) => {
      const src = path.join(dir, 'doc.mdd');
      const out = path.join(dir, 'doc.html');
      fs.writeFileSync(src, '# Check Test\n\nSome **bold** prose.\n', 'utf8');

      expect(await executeCompile(src, baseCliOpts({ output: out }))).toBe(0);
      expect(executeCheck(out, src, baseCliOpts({ check: true }))).toBe(0);
    });
  });

  test('executeCheck supports in-memory check when only source is given', async () => {
    await withTmpDir('mdpp-cli-mem-', async (dir) => {
      const src = path.join(dir, 'mem.mdd');
      fs.writeFileSync(src, '# In-Memory\n\nParagraph text.\n', 'utf8');

      expect(executeCheck(src, undefined, baseCliOpts({ check: true }))).toBe(0);
    });
  });

  test('executeCompile returns 1 when -L is passed with no SVG present', async () => {
    await withTmpDir('mdpp-cli-logo-', async (dir) => {
      const src = path.join(dir, 'doc.mdd');
      fs.writeFileSync(src, '# Doc\n', 'utf8');

      const code = await executeCompile(src, baseCliOpts({ logo: true, output: path.join(dir, 'out.html') }));
      expect(code).toBe(1);
    });
  });
});
