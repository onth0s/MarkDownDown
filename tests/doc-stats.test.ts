import { build } from '../src/compile.js';
import type { Options } from '../src/types.js';

describe('Document statistics client component and markup', () => {
  const options: Options = {
    inputFile: 'test.mdd',
    rawSource: `---
title: "Stats Test Doc"
---

# Heading One

This is a paragraph with several words to count. It contains a [link](https://example.com) and an [[#Heading One|internal link]].

## Code and Diagram

\`\`\`typescript
const greeting = "hello world";
console.log(greeting);
\`\`\`

\`\`\`diagram
A --> B
\`\`\`

| Col 1 | Col 2 |
| ----- | ----- |
| Val A | Val B |
`,
    outputPath: 'test.html',
    outputMode: 'single',
    accent: '#3b82f6',
    assetsDir: './assets',
    title: 'Stats Test Doc',
    noDiagrams: false,
    noTables: false,
    verbose: false,
  };

  test('emits #docStatsBtn without is-stub class and includes #docStats dialog', () => {
    const res = build(options);
    expect(res.html).toContain('id="docStatsBtn"');
    expect(res.html).not.toContain('id="docStatsStubBtn"');
    expect(res.html).toContain('id="docStats"');
    expect(res.html).toContain('id="docStatsGrid"');
    expect(res.html).toContain('id="docStatsCloseBtn"');
  });

  test('app.js bundle contains computeDocumentStatistics and toggle logic', () => {
    const res = build({ ...options, outputMode: 'split' });
    const js = res.assembled.js;
    expect(js).toContain('computeDocumentStatistics');
    expect(js).toContain('docStatsBtn');
    expect(js).toContain('docStatsGrid');
  });
});
