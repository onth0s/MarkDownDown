import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { diagramParse, diagramLayout, detectBackEdges } from '../src/renderer/diagram-svg.js';

const DIAGRAM_FENCE_RE = /```diagram[^\n]*\n([\s\S]*?)```/g;

function compileAllFences(source: string): number {
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

describe('spec-embedded diagrams compile (Gotcha #8)', () => {
  test('every diagram in `mdd --spec` parses + lays out', () => {
    const spec = execFileSync('node', ['dist/cli.cjs', '--spec'], { encoding: 'utf8' });
    expect(compileAllFences(spec)).toBeGreaterThan(0);
  });

  test('every diagram embedded in DSL.md parses + lays out (no build needed)', () => {
    const dslPath = path.resolve(process.cwd(), 'DSL.md');
    expect(fs.existsSync(dslPath)).toBe(true);
    const dsl = fs.readFileSync(dslPath, 'utf8');
    expect(compileAllFences(dsl)).toBeGreaterThan(0);
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