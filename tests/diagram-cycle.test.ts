import { diagramParse, diagramLayout, diagramBuildSvg, detectBackEdges }
  from '../src/renderer/diagram-svg.js';

describe('cyclic diagram support (Gotcha #2)', () => {
  test('2-node loop compiles + renders (NO crash)', () => {
    const m = diagramParse('flowchart TB\n A[One]\n B[Two]\n A -->|worsens| B\n B -->|increases| A');
    expect(() => diagramLayout(m)).not.toThrow();
    const svg = diagramBuildSvg(m, 'Loop');
    expect(svg).toContain('<svg');
    expect(svg).toContain('One');
    expect(svg).toContain('Two');
  });

  test('back-edge is detected and excluded from ranking', () => {
    const m = diagramParse('flowchart TB\n A[One]\n B[Two]\n A --> B\n B --> A');
    detectBackEdges(m);
    const back = m.edges.find(e => e.isBackEdge);
    expect(back).toBeDefined();
    expect(back!.from).toBe('B');
    expect(back!.to).toBe('A');
  });

  test('acyclic DAG has no back-edges', () => {
    const m = diagramParse('flowchart TB\n A[One]\n B[Two]\n A --> B');
    detectBackEdges(m);
    expect(m.edges.some(e => e.isBackEdge)).toBe(false);
  });

  test('self-loop is handled', () => {
    const m = diagramParse('flowchart TB\n A[Self] --> A');
    detectBackEdges(m);
    expect(m.edges[0].isBackEdge).toBe(true);
    expect(() => diagramLayout(m)).not.toThrow();
  });

  test('cycle normalization emits a non-fatal warning', () => {
    const m = diagramParse('flowchart TB\n A[One]\n B[Two]\n A --> B\n B --> A');
    diagramLayout(m);
    expect((m.warnings || []).some(w => /cyclic/i.test(w))).toBe(true);
  });

  test('larger diamond DAG still compiles (regression guard)', () => {
    const m = diagramParse(
      'flowchart TB\n A[In]\n B[X]\n C[Y]\n D[Out]\n A --> B\n A --> C\n B --> D\n C --> D'
    );
    expect(() => diagramLayout(m)).not.toThrow();
  });
});
