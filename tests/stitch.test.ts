import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from '../src/compile.js';
import { stitchDocument } from '../src/pipeline/stitch.js';
import { createMarkdownParser } from '../src/parser/markdown.js';
import { checkRoundTrip } from '../src/pipeline/check.js';
import type { Options } from '../src/types.js';

describe('multifile stitching ([[file.md]] / [[file.mdd]])', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdpp-stitch-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(rel: string, content: string): string {
    const full = path.join(tmpDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
    return full;
  }

  test('stitches ordered .md/.mdd includes, strips child frontmatter, and supports backslash paths', () => {
    writeFile('src/01_intro.md', '---\ntitle: "Ignored"\n---\n\n## Introduction\n\nHello from intro.\n');
    writeFile('src/02_body.mdd', '## Body\n\nBody text.\n');

    const entry = writeFile(
      'book.mdd',
      '---\ntitle: "Main Book"\n---\n\n# Main Book\n\n[[src/01_intro.md]]\n\n---\n\n[[src\\02_body.mdd]]\n',
    );
    const raw = fs.readFileSync(entry, 'utf8');
    const res = stitchDocument(raw, entry);

    expect(res.warnings).toEqual([]);
    expect(res.includedFiles).toHaveLength(2);
    expect(res.source).toContain('## Introduction');
    expect(res.source).toContain('## Body');
    expect(res.source).not.toContain('Ignored');
  });

  test('applies |+N heading shift outside code fences only', () => {
    writeFile(
      'chapters/ch1.md',
      '# Chapter One\n\n```markdown\n# Literal Heading Inside Fence\n```\n\n## Sub\n',
    );
    const entry = writeFile('main.mdd', '# Book\n\n[[chapters/ch1.md|+1]]\n');
    const res = stitchDocument(fs.readFileSync(entry, 'utf8'), entry);

    expect(res.source).toContain('## Chapter One');
    expect(res.source).toContain('### Sub');
    expect(res.source).toContain('# Literal Heading Inside Fence');
  });

  test('ignores includes inside code fences and inline prose wikilinks', () => {
    writeFile('assets/guide.md', '# Guide\n\nGuide body.\n');
    const entry = writeFile(
      'main.mdd',
      [
        '# Main',
        '',
        'See [[assets/guide.md]] for details.',
        '',
        '```markdown',
        '[[assets/guide.md]]',
        '```',
      ].join('\n'),
    );
    const res = stitchDocument(fs.readFileSync(entry, 'utf8'), entry);

    expect(res.includedFiles).toEqual([]);
    expect(res.source).toContain('See [[assets/guide.md]] for details.');
    expect(res.source).toContain('```markdown\n[[assets/guide.md]]\n```');
  });

  test('detects circular includes and missing files', () => {
    writeFile('a.md', '# A\n\n[[b.md]]\n');
    writeFile('b.md', '# B\n\n[[a.md]]\n');
    const entry = writeFile('main.mdd', '[[a.md]]\n');

    expect(() => stitchDocument(fs.readFileSync(entry, 'utf8'), entry)).toThrow(/Circular include detected/);

    const missingEntry = writeFile('missing.mdd', '[[does-not-exist.md]]\n');
    expect(() => stitchDocument(fs.readFileSync(missingEntry, 'utf8'), missingEntry)).toThrow(/Included file not found/);
  });

  test('enforces external path confinement by default and allows override with warning', () => {
    const outerDir = path.join(tmpDir, 'outer');
    const innerDir = path.join(tmpDir, 'inner');
    fs.mkdirSync(outerDir, { recursive: true });
    fs.mkdirSync(innerDir, { recursive: true });

    fs.writeFileSync(path.join(outerDir, 'shared.md'), '## Shared\n\nExternal content.\n', 'utf8');
    const entry = path.join(innerDir, 'doc.mdd');
    fs.writeFileSync(entry, '# Doc\n\n[[../outer/shared.md]]\n', 'utf8');

    const raw = fs.readFileSync(entry, 'utf8');
    expect(() => stitchDocument(raw, entry, false)).toThrow(/--allow-external-paths/);

    const allowed = stitchDocument(raw, entry, true);
    expect(allowed.source).toContain('External content.');
    expect(allowed.warnings).toHaveLength(1);
    expect(allowed.warnings[0]).toContain('outside the input directory');
  });

  test('compiles stitched document and passes roundtrip check', () => {
    writeFile('parts/part1.md', '## Part One\n\nContent with [[Main Title]] link.\n');
    const entry = writeFile(
      'book.mdd',
      '---\ntitle: "Book"\n---\n\n# Main Title\n\n[[parts/part1.md]]\n',
    );
    const outHtml = path.join(tmpDir, 'book.html');
    const opts: Options = {
      inputFile: entry,
      outputPath: outHtml,
      outputMode: 'single',
      assetsDir: path.join(tmpDir, 'assets'),
      title: 'Book',
      accent: '#3b82f6',
      noDiagrams: false,
      noTables: false,
      verbose: false,
      minify: true,
    };

    const built = build(opts);
    expect(built.html).toContain('Part One');
    expect(built.stats?.sections).toBe(2);

    const stitched = stitchDocument(fs.readFileSync(entry, 'utf8'), entry).source;
    const rt = checkRoundTrip({
      md: createMarkdownParser(),
      html: built.html,
      rawSource: stitched,
    });
    expect(rt.byteEqual).toBe(true);
    expect(rt.semanticEqual).toBe(true);
  });
});
