import { compile } from '../src/compile.js';
import { checkRoundTrip, extractEmbeddedSkeleton } from '../src/pipeline/check.js';
import { buildSkeleton } from '../src/renderer/skeleton-build.js';
import { createMarkdownParser } from '../src/parser/markdown.js';
import { extractProse } from '../src/renderer/html-extract.js';
import { assembleFromSkeleton, spanAt, PROSE } from '../src/renderer/skeleton.js';
import type { Options } from '../src/types.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const FIXTURE = path.resolve(process.cwd(), 'tests', 'fixtures', 'download.mdd');

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'md++-download-'));
}

function readFixture(): string {
  return fs.readFileSync(FIXTURE, 'utf8');
}

function options(outputPath: string, mode: 'single' | 'split', minify: boolean): Options {
  return {
    inputFile: FIXTURE,
    outputPath,
    outputMode: mode,
    assetsDir: path.resolve(process.cwd(), 'tests', 'fixtures'),
    title: 'Download Test',
    accent: '#3b82f6',
    minify,
    noDiagrams: false,
    noTables: false,
    verbose: false,
  };
}

function readEmbeddedPayload(html: string): { name?: string; skeleton: { v: number; fm: string; b: unknown[]; spans?: string[]; eol: string } } {
  const json = html.match(/<script type="application\/json" id="mdd-skeleton">([\s\S]*?)<\/script>/i)?.[1];
  expect(json).toBeDefined();
  return JSON.parse(json!);
}

describe('Download .mdd: embedded skeleton + byte-identical recovery', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = makeTmpDir();
  });
  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best-effort temp cleanup
    }
  });

  test('embeds the mdd-skeleton payload with the source name', () => {
    const result = compile(options(path.join(tmpDir, 'out.html'), 'single', true));
    expect(result.html).toContain('<script type="application/json" id="mdd-skeleton">');
    const embedded = extractEmbeddedSkeleton(result.html);
    expect(embedded).not.toBeNull();
    expect(embedded?.v).toBe(1);
    expect(Array.isArray(embedded?.b)).toBe(true);
    expect(embedded?.eol).toBeDefined();
    // Pruned to the lossy slots only (sparse record, not a full text copy).
    expect(Object.keys(embedded?.spans ?? {}).length).toBeGreaterThan(0);
    const payload = readEmbeddedPayload(result.html);
    expect(payload.name).toBe('download.mdd');
  });

  test('renders menu button and dropdown menu with original file download button and stubs', () => {
    const result = compile(options(path.join(tmpDir, 'out.html'), 'single', true));
    expect(result.html).toContain('id="menuBtn"');
    expect(result.html).toContain('id="dropdownMenu"');
    expect(result.html).toContain('id="downloadMddBtn"');
    expect(result.html).toContain('Download original MD++ file');
    expect(result.html).toContain('id="exportPdfStubBtn"');
    expect(result.html).toContain('id="docStatsStubBtn"');
    expect(result.html).toContain('Stub');
  });

  test('the embedded payload is the built skeleton, pruned to lossy slots', () => {
    const rawSource = readFixture();
    const md = createMarkdownParser();
    const built = buildSkeleton(md, rawSource);
    const result = compile(options(path.join(tmpDir, 'out.html'), 'single', true));
    const embedded = extractEmbeddedSkeleton(result.html);
    expect(embedded).not.toBeNull();

    // Structure and frontmatter ship verbatim: minification cannot touch them.
    expect(embedded!.fm).toBe(built.fm);
    expect(JSON.stringify(embedded!.b)).toBe(JSON.stringify(built.b));
    expect(embedded!.eol).toBe(built.eol);

    // Spans are pruned to exactly the slots whose DOM run differs, so the
    // payload stays a fraction of the document instead of a second copy.
    const runs = extractProse(result.html);
    const expected: Record<number, string> = {};
    let slot = 0;
    for (const seg of built.b) {
      if (seg !== PROSE) continue;
      const span = spanAt(built.spans, slot);
      if (span !== undefined && span !== runs[slot]) expected[slot] = span;
      slot++;
    }
    expect(Object.keys(expected).length).toBeGreaterThan(0);
    expect(JSON.stringify(embedded!.spans)).toBe(JSON.stringify(expected));
    // Every retained span is genuinely lossy from the DOM.
    expect(Object.keys(embedded!.spans ?? {}).length).toBeLessThan(slot);
  });

  test('the embedded payload drives byte-identical recovery (minified)', () => {
    const rawSource = readFixture();
    const md = createMarkdownParser();
    const result = compile(options(path.join(tmpDir, 'out.html'), 'single', true));
    const embedded = extractEmbeddedSkeleton(result.html);
    const cr = checkRoundTrip({
      md,
      html: result.html,
      rawSource,
      skeletonText: embedded ? JSON.stringify(embedded) : undefined,
    });
    expect(cr.ok).toBe(true);
    expect(cr.semanticEqual).toBe(true);
    expect(cr.byteEqual).toBe(true);
    expect(cr.fencesVerified).toBe(cr.fenceCount);
  });

  test('the embedded payload drives byte-identical recovery (unminified)', () => {
    const rawSource = readFixture();
    const md = createMarkdownParser();
    const result = compile(options(path.join(tmpDir, 'out.html'), 'single', false));
    const embedded = extractEmbeddedSkeleton(result.html);
    const cr = checkRoundTrip({
      md,
      html: result.html,
      rawSource,
      skeletonText: embedded ? JSON.stringify(embedded) : undefined,
    });
    expect(cr.ok).toBe(true);
    expect(cr.semanticEqual).toBe(true);
    expect(cr.byteEqual).toBe(true);
    expect(cr.fencesVerified).toBe(cr.fenceCount);
  });

  test('the client assembly rule (spans + runs) reproduces the source exactly', () => {
    const rawSource = readFixture();
    const result = compile(options(path.join(tmpDir, 'out.html'), 'single', true));
    const embedded = extractEmbeddedSkeleton(result.html);
    expect(embedded).not.toBeNull();
    const runs = extractProse(result.html);

    // Mirror of mddAssemble in templates/app/06-download.js: a PROSE slot whose
    // DOM run cannot reproduce its source text byte-for-byte (typographer,
    // minified whitespace) falls back to the source-verbatim span. The payload
    // is pruned to exactly those slots, so a span's presence IS the override.
    let p = 0;
    let slot = 0;
    const parts = [embedded!.fm];
    let overrides = 0;
    for (const seg of embedded!.b) {
      if (seg === PROSE) {
        const run = runs[p];
        p++;
        const span = spanAt(embedded!.spans, slot);
        slot++;
        if (span !== undefined && run !== undefined && span !== run) {
          parts.push(span);
          overrides++;
        } else {
          parts.push(run ?? '');
        }
      } else if (typeof seg === 'number') {
        p++;
      } else {
        parts.push(seg);
      }
    }
    let rebuilt = parts.join('');
    if (embedded!.eol === '\r\n') rebuilt = rebuilt.replace(/(?<!\r)\n/g, '\r\n');

    expect(rebuilt).toBe(rawSource);
    // The fixture exercises the fidelity path: a softbreak merge plus a
    // typographer rewrite both need a source-verbatim span.
    expect(overrides).toBeGreaterThan(0);
    // Without fidelity the naive assembly must differ (i.e. the spans matter).
    expect(assembleFromSkeleton(embedded!, runs)).not.toBe(rawSource);
  });

  test('checkRoundTrip auto-picks up the embedded skeleton (no explicit skeletonText)', () => {
    const rawSource = readFixture();
    const md = createMarkdownParser();
    const result = compile(options(path.join(tmpDir, 'out.html'), 'single', true));
    const cr = checkRoundTrip({ md, html: result.html, rawSource });
    expect(cr.ok).toBe(true);
    expect(cr.byteEqual).toBe(true);
  });

  test('split mode also embeds the mdd-skeleton in the html', () => {
    const outDir = path.join(tmpDir, 'site');
    compile(options(outDir, 'split', false));
    const htmlPath = path.join(outDir, 'download.html');
    expect(fs.existsSync(htmlPath)).toBe(true);
    const html = fs.readFileSync(htmlPath, 'utf8');
    expect(html).toContain('<script type="application/json" id="mdd-skeleton">');
    const embedded = extractEmbeddedSkeleton(html);
    expect(embedded).not.toBeNull();
  });
});
