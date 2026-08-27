import { compile } from '../src/compile.js';
import type { CompileResult, Options } from '../src/types.js';
import { CompileError } from '../src/util/error.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SHOWCASE_MDD = path.resolve(process.cwd(), 'showcase', 'showcase.mdd');
const ASSET_SVG = path.resolve(process.cwd(), 'showcase', 'assets', 'mdpp-logo.svg');

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'md++-showcase-'));
}

function options(mode: 'single' | 'split', outputDir: string): Options {
  return {
    inputFile: SHOWCASE_MDD,
    outputPath: path.join(outputDir, mode === 'single' ? 'out.html' : 'site'),
    outputMode: mode,
    assetsDir: path.resolve(process.cwd(), 'showcase', 'assets'),
    title: 'Capability Showcase',
    accent: '#8b5cf6',
    noDiagrams: false,
    noTables: false,
    verbose: false,
  };
}

describe('showcase/showcase.mdd — self-compiled capability showcase', () => {
  let tmpDir: string;
  let result: CompileResult;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    result = compile(options('single', tmpDir));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function readSingle(): string {
    return fs.readFileSync(path.join(tmpDir, 'out.html'), 'utf8');
  }

  test('source file and demo asset exist in the repo', () => {
    expect(fs.existsSync(SHOWCASE_MDD)).toBe(true);
    expect(fs.existsSync(ASSET_SVG)).toBe(true);
    const src = fs.readFileSync(SHOWCASE_MDD, 'utf8');
    expect(src).toContain('kicker');
    expect(src).toContain('bg_lum');
    expect(src).toContain('pills');
  });

  test('single mode compiles and surfaces cyclic + file-link warnings', () => {
    expect(result.warnings.filter(w => /cyclic edge\(s\)/.test(w)).length).toBe(2);
    expect(result.warnings.some(w => /File link target not found:/.test(w))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'out.html'))).toBe(true);
  });

  test('single mode renders hero, frontmatter features, accent, and custom css', () => {
    const html = readSingle();

    expect(html).toMatch(/class="hero"[\s\S]*?Markdown\+\+ Capability Showcase/);
    expect(html).toContain('Full-spectrum demonstration');
    expect(html).toContain('#8b5cf6');
    expect(html).toContain('nav-history-bar');
    expect(html).toContain('data-label-ord');
    expect(html).toContain('border-bottom-width: 2px');
  });

  test('single mode resolves wikilinks: direct, item-heading, fuzzy, and asset', () => {
    const html = readSingle();

    expect(html).toContain('class="item-heading"');
    expect(html).toContain('href="#wikilink-resolution"');
    expect(html).toContain('href="#collision-detection"');
    expect(html).toContain('data:image/svg+xml;base64,');
  });

  test('single mode handles file links, escaped wikilinks, and raw HTML escaping', () => {
    const html = readSingle();

    expect(html).toContain('href="file:///SHOWCASE_NONEXISTENT_QUIET.txt"');
    expect(html).toContain('&lt;sup&gt;');
    expect(html).not.toMatch(/<sup>raw html<\/sup>/);
  });

  test('single mode renders callout alerts with capitalized titles', () => {
    const html = readSingle();

    expect(html).toContain('class="alert"');
    expect(html).toContain('KEY TAKEAWAY');
    expect(html).toContain('WARNING');
  });

  test('single mode renders all 9 diagram fences with return arcs', () => {
    const html = readSingle();
    const diagramCount = (html.match(/class="diagram-render">/g) || []).length;

    expect(diagramCount).toBe(9);
    expect(html).toContain('data-direction="TB"');
    expect(html).toContain('data-direction="LR"');
    expect((html.match(/edge-path is-back-edge/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(html).toContain('requeues failures');
  });

  test('single mode renders the table DSL and search-sync metadata', () => {
    const html = readSingle();
    const tableCount = (html.match(/class="table-render">/g) || []).length;

    expect(tableCount).toBe(1);
    expect(html).toContain('Table DSL');
    expect(html).toContain('alignment markers ignored');
  });

  test('split mode emits modular output incl. copied assets', () => {
    compile(options('split', tmpDir));
    const site = path.join(tmpDir, 'site');

    expect(fs.existsSync(path.join(site, 'showcase.html'))).toBe(true);
    expect(fs.existsSync(path.join(site, 'style.css'))).toBe(true);
    expect(fs.existsSync(path.join(site, 'app.js'))).toBe(true);
    expect(fs.existsSync(path.join(site, 'assets', 'mdpp-logo.svg'))).toBe(true);

    const html = fs.readFileSync(path.join(site, 'showcase.html'), 'utf8');
    expect(html).toContain('src="mdpp-logo.svg"');
  });

  test('embedded examples compile without unresolved-target errors', () => {
    expect(() => compile(options('single', tmpDir))).not.toThrowError(CompileError);
  });
});