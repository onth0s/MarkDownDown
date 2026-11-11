import { build } from '../src/compile.js';
import { tableParse, tableBuildSvg } from '../src/renderer/table-svg.js';
import type { Options } from '../src/types.js';
import path from 'node:path';

function makeOpts(overrides: Partial<Options> = {}): Options {
  return {
    inputFile: path.resolve('test-table-wikilink.mdd'),
    outputPath: path.resolve('test-table-wikilink.html'),
    outputMode: 'single',
    title: 'Table Wikilink Test',
    assetsDir: path.resolve('non-existent-assets-dir-for-tests'),
    accent: '#3b82f6',
    noDiagrams: false,
    noTables: false,
    verbose: false,
    ...overrides,
  };
}

describe('Table Wikilinks', () => {
  test('tableBuildSvg renders wikilink with href via linkResolver', () => {
    const raw = `| Feature | Link |
|---|---|
| Core | [[Introduction]] |
| Ext | [[Docs|Read Docs]] |`;
    const model = tableParse(raw);
    const resolver = (target: string, _display: string) => {
      if (target === 'Introduction') return { href: '#introduction' };
      if (target === 'Docs') return { href: '#docs' };
      return null;
    };
    const svg = tableBuildSvg(model, 'Test Table', resolver);
    expect(svg).toContain('<a href="#introduction">');
    expect(svg).toContain('Introduction');
    expect(svg).toContain('<a href="#docs">');
    expect(svg).toContain('Read Docs');
  });

  test('full compilation resolves table wikilinks against headings', () => {
    const input = `---
title: Table Wikilink Test
---

# Overview

Welcome to the overview.

## Target Section

Details here.

\`\`\`table
TITLE: Test Table
| Topic | Reference |
|---|---|
| General | [[Overview]] |
| Deep Dive | [[Target Section|Explore Target]] |
\`\`\`
`;
    const result = build(makeOpts({ rawSource: input }));

    expect(result.warnings).toEqual([]);
    expect(result.html).toContain('class="table-svg"');
    expect(result.html).toContain('<a href="#overview">');
    expect(result.html).toContain('Overview');
    expect(result.html).toContain('<a href="#target-section">');
    expect(result.html).toContain('Explore Target');
    // Ensure table wikilinks are counted in stats
    expect(result.stats?.wikilinks).toBe(2);
  });

  test('unresolved wikilink in table throws CompileError', () => {
    const input = `---
title: Broken Link
---

# Section

\`\`\`table
| Col |
|---|
| [[XYZ_Completely_Unrelated_Target_999]] |
\`\`\`
`;
    expect(() => {
      build(makeOpts({ rawSource: input }));
    }).toThrow(/unresolved or ambiguous wikilinks/i);
  });
});
