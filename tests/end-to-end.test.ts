import { compile } from '../src/compile.js';
import type { Options } from '../src/types.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'md++-e2e-'));
}

function baseOptions(inputFile: string, outputDir: string): Options {
  return {
    inputFile,
    outputPath: path.join(outputDir, 'out.html'),
    outputMode: 'single',
    assetsDir: path.join(path.dirname(inputFile), 'assets'),
    title: 'Test',
    accent: '#3b82f6',
    noDiagrams: false,
    noTables: false,
    verbose: false,
  };
}

const SIMPLE_MDD = `---
title: "E2E Test"
accent: "#10b981"
---

# Introduction

This is a test document.

## Getting Started

Some content here.

### API Reference

More details.

\`\`\`diagram
TITLE: Flow
flowchart TB
  A[Start] --> B[End]
\`\`\`

\`\`\`table
TITLE: Data
| Name | Value |
|------|-------|
| Foo  | 42    |
\`\`\`
`;

const WIKILINK_MDD = `# Overview

See [[Introduction]] for more.

# Introduction

Welcome!
`;

const FRONTMATTER_MDD = `---
title: "Custom Title"
accent: "#f43f5e"
---

# Hello

Content.
`;

describe('end-to-end: compile pipeline', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('produces valid HTML with all structural elements', async () => {
    const inputFile = path.join(tmpDir, 'test.mdd');
    fs.writeFileSync(inputFile, SIMPLE_MDD);
    const opts = baseOptions(inputFile, tmpDir);
    const result = await compile(opts);
    const html = result.html;

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<title>E2E Test</title>');
    expect(html).toContain('<style>');
    expect(html).toContain('<script>');
    expect(html).toContain('id="toc"');
    expect(html).toContain('id="search"');
    expect(html).toContain('data-theme="dark"');
    expect(html).toContain('<article');
  });

  test('renders markdown headings with IDs', async () => {
    const inputFile = path.join(tmpDir, 'test.mdd');
    fs.writeFileSync(inputFile, SIMPLE_MDD);
    const opts = baseOptions(inputFile, tmpDir);
    const result = await compile(opts);

    expect(result.html).toContain('id="introduction"');
    expect(result.html).toContain('id="getting-started"');
    expect(result.html).toContain('id="api-reference"');
  });

  test('renders diagram SVG', async () => {
    const inputFile = path.join(tmpDir, 'test.mdd');
    fs.writeFileSync(inputFile, SIMPLE_MDD);
    const opts = baseOptions(inputFile, tmpDir);
    const result = await compile(opts);

    expect(result.html).toContain('diagram-svg');
    expect(result.html).toContain('Start');
    expect(result.html).toContain('End');
  });

  test('renders table SVG', async () => {
    const inputFile = path.join(tmpDir, 'test.mdd');
    fs.writeFileSync(inputFile, SIMPLE_MDD);
    const opts = baseOptions(inputFile, tmpDir);
    const result = await compile(opts);

    expect(result.html).toContain('table-svg');
    expect(result.html).toContain('Foo');
    expect(result.html).toContain('42');
  });

  test('resolves wikilinks to headings', async () => {
    const inputFile = path.join(tmpDir, 'test.mdd');
    fs.writeFileSync(inputFile, WIKILINK_MDD);
    const opts = baseOptions(inputFile, tmpDir);
    const result = await compile(opts);

    expect(result.html).toContain('href="#introduction"');
    expect(result.html).toContain('Introduction');
  });

  test('applies accent color from frontmatter', async () => {
    const inputFile = path.join(tmpDir, 'test.mdd');
    fs.writeFileSync(inputFile, FRONTMATTER_MDD);
    const opts = baseOptions(inputFile, tmpDir);
    const result = await compile(opts);

    expect(result.html).toContain('--accent: #f43f5e');
    expect(result.html).toContain('Custom Title');
  });

  test('--split mode writes separate files', async () => {
    const inputFile = path.join(tmpDir, 'test.mdd');
    fs.writeFileSync(inputFile, SIMPLE_MDD);
    const outDir = path.join(tmpDir, 'output');
    const opts: Options = {
      ...baseOptions(inputFile, outDir),
      outputMode: 'split',
      outputPath: outDir,
    };
    await compile(opts);

    expect(fs.existsSync(path.join(outDir, 'test.html'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'style.css'))).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'app.js'))).toBe(true);
  });

  test('skipDiagrams flag omits diagram SVG', async () => {
    const inputFile = path.join(tmpDir, 'test.mdd');
    fs.writeFileSync(inputFile, SIMPLE_MDD);
    const opts = baseOptions(inputFile, tmpDir);
    opts.noDiagrams = true;
    const result = await compile(opts);

    expect(result.html).not.toContain('<svg class="diagram-svg"');
  });

  test('skipTables flag omits table SVG', async () => {
    const inputFile = path.join(tmpDir, 'test.mdd');
    fs.writeFileSync(inputFile, SIMPLE_MDD);
    const opts = baseOptions(inputFile, tmpDir);
    opts.noTables = true;
    const result = await compile(opts);

    expect(result.html).not.toContain('<svg class="table-svg"');
  });

  test('title falls back to filename when no frontmatter', async () => {
    const inputFile = path.join(tmpDir, 'mydoc.mdd');
    fs.writeFileSync(inputFile, '# Hello\n\nWorld.');
    const opts = baseOptions(inputFile, tmpDir);
    opts.title = 'mydoc';
    const result = await compile(opts);

    expect(result.html).toContain('<title>mydoc</title>');
  });

  test('compiles Refactoring Strategy.mdd ground truth without errors and with serialized diagram labels and alerts', async () => {
    const strategyFile = path.resolve('scratch/Refactoring Strategy.mdd');
    if (fs.existsSync(strategyFile)) {
      const opts: Options = {
        inputFile: strategyFile,
        outputPath: path.join(tmpDir, 'strategy.html'),
        outputMode: 'single',
        assetsDir: path.resolve('scratch/assets'),
        title: 'Refactoring Strategy',
        accent: '#ec4899',
        noDiagrams: false,
        noTables: false,
        verbose: false,
      };
      const result = await compile(opts);
      expect(result.html).toContain('class="alert alert-important"');
      expect(result.html).toContain('data-labels=');
      expect(result.html).toContain('Phase 6: Full Verification, Documentation &amp; Final Polish');
    }
  });

  test('zero warnings on clean input', async () => {
    const inputFile = path.join(tmpDir, 'test.mdd');
    fs.writeFileSync(inputFile, SIMPLE_MDD);
    const opts = baseOptions(inputFile, tmpDir);
    const result = await compile(opts);

    expect(result.warnings).toHaveLength(0);
  });

  test('compiles standard .md file cleanly', async () => {
    const inputFile = path.join(tmpDir, 'sample.md');
    fs.writeFileSync(inputFile, '# Standard Markdown\n\nWorks natively.');
    const opts = baseOptions(inputFile, tmpDir);
    const result = await compile(opts);

    expect(result.html).toContain('id="standard-markdown"');
    expect(result.warnings).toHaveLength(0);
  });

  test('adjacent standard codeblock and table render cleanly without nesting .code-wrap', async () => {
    const ADJACENT_MDD = `# CLI Usage

\`\`\`powershell
mdd <input.mdd> [options]
\`\`\`

\`\`\`table
TITLE: Options
| Flag | Description |
| -o | Output path |
\`\`\`
`;
    const inputFile = path.join(tmpDir, 'adjacent.mdd');
    fs.writeFileSync(inputFile, ADJACENT_MDD);
    const opts = baseOptions(inputFile, tmpDir);
    const result = await compile(opts);

    // Verify both have .code-wrap and are not nested
    const matches = [...result.html.matchAll(/<div class="code-wrap\b[^"]*"[^>]*>/g)];
    expect(matches.length).toBe(2);
    // Ensure the first code-wrap closes before the second opens
    const firstWrap = result.html.indexOf('<div class="code-wrap">');
    const tableWrap = result.html.indexOf('<div class="code-wrap table"');
    expect(firstWrap).toBeGreaterThan(-1);
    expect(tableWrap).toBeGreaterThan(firstWrap);
    const between = result.html.slice(firstWrap, tableWrap);
    expect(between).toContain('</div>');
  });

  test('compiles diagram with direction on fence header (e.g. ```diagram LR)', async () => {
    const FENCE_DIR_MDD = `# Architecture

\`\`\`diagram LR
TITLE: Auth Flow
A["Client"] --> B["Gateway"]
\`\`\`
`;
    const inputFile = path.join(tmpDir, 'fence-dir.mdd');
    fs.writeFileSync(inputFile, FENCE_DIR_MDD);
    const opts = baseOptions(inputFile, tmpDir);
    const result = await compile(opts);

    expect(result.html).toContain('class="code-wrap diagram"');
    expect(result.html).toContain('data-title="Auth Flow"');
    expect(result.html).toContain('data-direction="LR"');
    expect(result.html).toContain('diagram-svg');
    expect(result.html).toContain('Client');
    expect(result.html).toContain('Gateway');
  });

  test('splices slash sequences in text with <wbr> for mobile responsive word-wrapping', async () => {
    const SLASH_MDD = `# Spec

* fragmentation (Theory/Principles/Protocols/Mechanisms/Reference)
`;
    const inputFile = path.join(tmpDir, 'slash.mdd');
    fs.writeFileSync(inputFile, SLASH_MDD);
    const opts = baseOptions(inputFile, tmpDir);
    const result = await compile(opts);

    expect(result.html).toContain('Theory/<wbr>Principles/<wbr>Protocols/<wbr>Mechanisms/<wbr>Reference');
  });
});
