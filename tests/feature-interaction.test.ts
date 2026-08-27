import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compile } from '../src/compile.js';
import type { Options } from '../src/types.js';

describe('all MDD features combined (Gotcha #6)', () => {
  test('wikilinks + diagram(cyclic) + table + callout + item headings', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdd-'));
    const file = path.join(dir, 'combo.mdd');
    fs.writeFileSync(file, `---
title: Combined
---
# Heading

## Section

[!NOTE]
A callout with a [[section]] wikilink.

### * Item heading term

\`\`\`diagram
flowchart TB
 A[Start] --> B[End]
 B --> A
\`\`\`

\`\`\`table
| Col A | Col B |
|-------|-------|
| 1     | 2     |
\`\`\`
`);
    const opts: Options = {
      title: 'combo',
      inputFile: file,
      assetsDir: path.join(dir, 'assets'),
      accent: '#3b82f6',
      theme: 'light',
      outputPath: path.join(dir, 'combo.html'),
      outputMode: 'single',
      noDiagrams: false,
      noTables: false,
      verbose: false,
    };
    const res = compile(opts);
    expect(res.html).toContain('Start');
    expect(res.html).toContain('Col A');
    expect(res.html).toContain('alert');
    fs.rmSync(dir, { recursive: true });
  });
});
