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

  test('unlabeled edge form `A -- label --> B` is parsed', () => {
    const m = diagramParse('flowchart TB\n A[One]\n B[Two]\n A -- back loop --> B');
    const edge = m.edges[0];
    expect(edge.from).toBe('A');
    expect(edge.to).toBe('B');
    expect(edge.label).toBe('back loop');
  });
});

function extractNums(dStr: string): number[] {
  return [...dStr.matchAll(/-?\d+(?:\.\d+)?/g)].map(match => Number(match[0]));
}

describe('cyclic diagram return-arc rendering', () => {
  test('TB back-edge is drawn as a return arc dipping below the graph', () => {
    const m = diagramParse('flowchart TB\n A[One]\n B[Two]\n A --> B\n B --> A');
    diagramLayout(m);
    const svg = diagramBuildSvg(m, 'Loop');
    const backD = /class="edge-path is-back-edge" d="([^"]+)"/.exec(svg);
    expect(backD).not.toBeNull();
    const nums = extractNums(backD![1]);
    const ys = nums.filter((_, i) => i % 2 === 1);
    expect(Math.max(...ys)).toBeGreaterThan(m.maxY);
    expect((svg.match(/is-back-edge/g) || []).length).toBe(1);
  });

  test('LR back-edge is drawn as a return arc to the right of the graph', () => {
    const m = diagramParse('flowchart LR\n A[One]\n B[Two]\n A --> B\n B --> A');
    diagramLayout(m);
    const svg = diagramBuildSvg(m, 'Loop');
    const backD = /class="edge-path is-back-edge" d="([^"]+)"/.exec(svg);
    expect(backD).not.toBeNull();
    const nums = extractNums(backD![1]);
    const xs = nums.filter((_, i) => i % 2 === 0);
    const maxNodeRight = Math.max(...[...m.nodes.values()].map(n => m.cx.get(n.id)! + n.w / 2));
    expect(Math.max(...xs)).toBeGreaterThan(maxNodeRight);
    expect((svg.match(/is-back-edge/g) || []).length).toBe(1);
  });

  test('self-loop is drawn as a side arc clearing the node width', () => {
    const m = diagramParse('flowchart TB\n A[Self] --> A');
    diagramLayout(m);
    const svg = diagramBuildSvg(m, 'Loop');
    const backD = /class="edge-path is-back-edge" d="([^"]+)"/.exec(svg);
    expect(backD).not.toBeNull();
    const nums = extractNums(backD![1]);
    const xs = nums.filter((_, i) => i % 2 === 0);
    const nodeRight = m.cx.get('A')! + m.nodes.get('A')!.w / 2;
    expect(Math.max(...xs)).toBeGreaterThan(nodeRight);
  });

  test('normal edges do not carry the back-edge class', () => {
    const m = diagramParse('flowchart TB\n A[One]\n B[Two]\n A --> B');
    diagramLayout(m);
    const svg = diagramBuildSvg(m, 'DAG');
    expect(svg).not.toContain('is-back-edge');
  });
});
