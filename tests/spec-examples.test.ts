import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { diagramParse, diagramLayout, detectBackEdges } from '../src/renderer/diagram-svg.js';
import { tableParse, tableBuildSvg } from '../src/renderer/table-svg.js';
import { compile } from '../src/compile.js';
import { SPEC } from '../src/spec.js';

const DIAGRAM_FENCE_RE = /```diagram[^\n]*\n([\s\S]*?)```/g;
const TABLE_FENCE_RE = /```table[^\n]*\n([\s\S]*?)```/g;

function compileAllDiagramFences(source: string): number {
  let count = 0;
  for (const f of source.match(DIAGRAM_FENCE_RE) || []) {
    const body = f.replace(/```diagram[^\n]*\n/, '').replace(/```$/, '');
    const m = diagramParse(body);
    detectBackEdges(m);
    expect(() => diagramLayout(m)).not.toThrow();
    count++;
  }
  return count;
}

function compileAllTableFences(source: string): number {
  let count = 0;
  for (const f of source.match(TABLE_FENCE_RE) || []) {
    const body = f.replace(/```table[^\n]*\n/, '').replace(/```$/, '');
    const m = tableParse(body);
    expect(m.headers.length).toBeGreaterThan(0);
    expect(m.rows.length).toBeGreaterThan(0);
    const svg = tableBuildSvg(m, 'Test Table');
    expect(svg).toContain('<svg class="table-svg"');
    expect(svg).toContain('</svg>');
    count++;
  }
  return count;
}

describe('spec-embedded diagrams compile (Gotcha #8)', () => {
  test('every diagram in `mdd --spec` parses + lays out', () => {
    const spec = execFileSync('node', ['dist/cli.cjs', '--spec'], { encoding: 'utf8' });
    expect(compileAllDiagramFences(spec)).toBeGreaterThan(0);
  });

  test('every diagram embedded in DSL.md parses + lays out (no build needed)', () => {
    const dslPath = path.resolve(process.cwd(), 'DSL.md');
    expect(fs.existsSync(dslPath)).toBe(true);
    const dsl = fs.readFileSync(dslPath, 'utf8');
    expect(compileAllDiagramFences(dsl)).toBeGreaterThan(0);
  });

  test('every diagram embedded in SPEC.md parses + lays out', () => {
    const specPath = path.resolve(process.cwd(), 'SPEC.md');
    expect(fs.existsSync(specPath)).toBe(true);
    const spec = fs.readFileSync(specPath, 'utf8');
    expect(compileAllDiagramFences(spec)).toBeGreaterThan(0);
  });

  test('DSL.md cyclic example both compiles and emits a cycle warning', () => {
    const dsl = fs.readFileSync(path.resolve(process.cwd(), 'DSL.md'), 'utf8');
    const fences = dsl.match(DIAGRAM_FENCE_RE) || [];
    const cyclic = fences.filter(f => /Cyclic|Supervisor Loop|feeds back|re-enqueues/i.test(f));
    expect(cyclic.length).toBeGreaterThan(0);
    for (const f of cyclic) {
      const body = f.replace(/```diagram[^\n]*\n/, '').replace(/```$/, '');
      const m = diagramParse(body);
      detectBackEdges(m);
      expect(m.edges.some(e => e.isBackEdge)).toBe(true);
      expect(() => diagramLayout(m)).not.toThrow();
      expect((m.warnings || []).some(w => /cyclic/i.test(w))).toBe(true);
    }
  });
});

describe('spec-embedded tables compile', () => {
  test('every table in `mdd --spec` parses and generates valid SVG', () => {
    const spec = execFileSync('node', ['dist/cli.cjs', '--spec'], { encoding: 'utf8' });
    expect(compileAllTableFences(spec)).toBe(13);
  });

  test('every table embedded in SPEC.md parses and generates valid SVG', () => {
    const spec = fs.readFileSync(path.resolve(process.cwd(), 'SPEC.md'), 'utf8');
    expect(compileAllTableFences(spec)).toBe(5);
  });

  test('every table embedded in DSL.md parses and generates valid SVG', () => {
    const dsl = fs.readFileSync(path.resolve(process.cwd(), 'DSL.md'), 'utf8');
    expect(compileAllTableFences(dsl)).toBe(8);
  });
});

describe('spec alignment and compilation', () => {
  test('CLI --spec matches SPEC exported string', () => {
    const cliSpec = execFileSync('node', ['dist/cli.cjs', '--spec'], { encoding: 'utf8' });
    expect(cliSpec).toBe(SPEC);
  });

  test('SPEC.md compiles end-to-end through the compiler with zero errors', () => {
    const specPath = path.resolve(process.cwd(), 'SPEC.md');
    const result = compile({
      title: 'SPEC',
      assetsDir: path.resolve(process.cwd(), 'assets'),
      accent: '#3b82f6',
      inputFile: specPath,
      outputPath: path.resolve(process.cwd(), 'dist/spec-test.html'),
      outputMode: 'single',
      noDiagrams: false,
      noTables: false,
      verbose: false,
    });
    expect(result.html).toContain('<html');
    expect(result.html).toContain('class="table-svg"');
    expect(result.html).toContain('class="diagram-svg"');
  });

  test('DSL.md compiles end-to-end through the compiler with zero errors', () => {
    const dslPath = path.resolve(process.cwd(), 'DSL.md');
    const result = compile({
      title: 'DSL',
      assetsDir: path.resolve(process.cwd(), 'assets'),
      accent: '#3b82f6',
      inputFile: dslPath,
      outputPath: path.resolve(process.cwd(), 'dist/dsl-test.html'),
      outputMode: 'single',
      noDiagrams: false,
      noTables: false,
      verbose: false,
    });
    expect(result.html).toContain('<html');
    expect(result.html).toContain('class="table-svg"');
    expect(result.html).toContain('class="diagram-svg"');
  });

  test('full combined `mdd --spec` compiles cleanly through compiler', () => {
    const result = compile({
      title: 'Combined Spec',
      assetsDir: path.resolve(process.cwd(), 'assets'),
      accent: '#3b82f6',
      inputFile: path.resolve(process.cwd(), 'SPEC.md'),
      rawSource: SPEC,
      outputPath: path.resolve(process.cwd(), 'dist/combined-spec-test.html'),
      outputMode: 'single',
      noDiagrams: false,
      noTables: false,
      verbose: false,
    });
    expect(result.html).toContain('<html');
    expect(result.stats?.sections).toBeGreaterThan(40);
  });
});