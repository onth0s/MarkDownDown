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
    // Only the genuine multi-node cycle warns. The self-loop diagram is an
    // ordinary construct and stays quiet.
    expect(result.warnings.filter(w => /cyclic edge/.test(w)).length).toBe(1);
    expect(result.warnings.some(w => /File link target not found:/.test(w))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'out.html'))).toBe(true);
  });

  test('self-loops do not emit a cycle warning', () => {
    const loopOnly = compile({
      ...options('single', tmpDir),
      rawSource: '```diagram\nTITLE: Loop\nA[Self] --> A\n```\n',
    });
    expect(loopOnly.warnings.some(w => /cyclic|self-loop/.test(w))).toBe(false);
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

  test('every rendered SVG is self-describing and fits the reading column', () => {
    const html = readSingle();
    // Scoped to the generated diagram/table SVGs; the page also embeds the
    // brand logo, which is not ours to constrain.
    const svgs = [...html.matchAll(/<svg class="(?:diagram|table)-svg"[\s\S]*?<\/svg>/g)].map(m => m[0]);
    expect(svgs.length).toBeGreaterThan(0);

    for (const svg of svgs) {
      const label = /aria-label="([^"]*)"/.exec(svg)?.[1] ?? '(unlabelled)';

      // Every SVG names itself for a screen reader. A `TITLE:` directive is
      // preferred; failing that the nearest heading is used, so no diagram is
      // announced as the document title.
      expect(/role="img"/.test(svg)).toBe(true);
      expect(label).not.toBe('(unlabelled)');
      expect(label).not.toBe('Markdown++ Capability Showcase');

      // A legibility floor, so a wide diagram scales down to 60% of natural
      // width before it starts scrolling.
      expect(svg).toContain('--svg-min-w');

      // Usable reading width is 1080 - 2*18px padding. Anything wider is
      // cropped or forces a horizontal page scroll.
      expect(Number(/ width="(\d+)"/.exec(svg)![1])).toBeLessThanOrEqual(1044);
    }

    // The undirected `---` form is documented as arrowless; it used to draw a
    // head anyway, which asserted a direction the author never wrote.
    const edges = [...html.matchAll(/<path class="edge-path"[^>]*>/g)].map(m => m[0]);
    expect(edges.length).toBeGreaterThan(0);
    expect(edges.some(e => !e.includes('marker-end'))).toBe(true);
    expect(edges.some(e => e.includes('marker-end'))).toBe(true);

    // `data-label-ord` is omitted on unlabelled elements rather than emitted as
    // a -1 sentinel, so a search match can never resolve to an arbitrary node.
    expect(html).not.toContain('data-label-ord="-1"');
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