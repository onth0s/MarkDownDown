import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { compile } from '../src/compile.js';
import { findChromiumBinary, exportToPdf } from '../src/cli/pdf-runner.js';
import type { Options } from '../src/types.js';

describe('PDF Export & Print Stylesheet', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdd-pdf-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function createOptions(outputPath: string): Options {
    const inputFile = path.join(tmpDir, 'test.mdd');
    fs.writeFileSync(inputFile, '# Heading 1\n\nSome paragraph text.\n', 'utf8');
    return {
      title: 'PDF Test',
      assetsDir: path.join(tmpDir, 'assets'),
      accent: '#3b82f6',
      inputFile,
      outputPath,
      outputMode: 'single',
      noDiagrams: false,
      noTables: false,
      verbose: false,
      minify: false,
    };
  }

  test('compiled HTML bundles print media queries and PDF export button', () => {
    const outHtml = path.join(tmpDir, 'out.html');
    const result = compile(createOptions(outHtml));

    // 1. Verify export button in shell
    expect(result.html).toContain('id="exportPdfBtn"');
    expect(result.html).toContain('Export as PDF');
    expect(result.html).not.toContain('id="exportPdfStubBtn"');

    // 2. Verify print stylesheet media queries
    expect(result.html).toContain('@media print');
    expect(result.html).toContain('A4 portrait');
    expect(result.html).toContain('break-inside: avoid');
    expect(result.html).toContain('.diagram-auto .diagram-tb');
    expect(result.html).toContain('.diagram-auto .diagram-lr');

    // 3. Verify client script is bundled
    expect(result.html).toContain('initPdfExport');
    expect(result.html).toContain('window.print()');
  });

  const testIfChrome = findChromiumBinary() ? test : test.skip;

  testIfChrome('findChromiumBinary locates installed browser or respects CHROME_PATH', () => {
    const detected = findChromiumBinary();
    expect(typeof detected).toBe('string');
    expect(fs.existsSync(detected!)).toBe(true);
  });

  test('exportToPdf handles invalid inputs gracefully', () => {
    const res = exportToPdf({
      htmlPath: path.join(tmpDir, 'nonexistent.html'),
      pdfPath: path.join(tmpDir, 'out.pdf'),
    });
    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();
  });

  testIfChrome('exportToPdf generates valid PDF file when browser is available', () => {

    const outHtml = path.join(tmpDir, 'test.html');
    const outPdf = path.join(tmpDir, 'test.pdf');
    fs.writeFileSync(
      outHtml,
      '<!DOCTYPE html><html><body><h1>Print Test</h1><p>Testing headless PDF output.</p></body></html>',
      'utf8'
    );

    const res = exportToPdf({
      htmlPath: outHtml,
      pdfPath: outPdf,
      browserPath: findChromiumBinary()!,
    });

    expect(res.success).toBe(true);
    expect(fs.existsSync(outPdf)).toBe(true);
    expect(fs.statSync(outPdf).size).toBeGreaterThan(1000);
  });
});
