import { diagramParse, diagramLayout, diagramBuildSvg, detectBackEdges, resolveGeometry, edgeNodeCollisions }
  from '../src/renderer/diagram/index.js';

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
  test('TB back-edge runs in a side gutter, not across the graph', () => {
    const m = diagramParse('flowchart TB\n A[One]\n B[Two]\n A --> B\n B --> A');
    diagramLayout(m);
    const svg = diagramBuildSvg(m, 'Loop');
    const backD = /class="edge-path is-back-edge" d="([^"]+)"/.exec(svg);
    expect(backD).not.toBeNull();
    const nums = extractNums(backD![1]);
    const xs = nums.filter((_, i) => i % 2 === 0);
    const maxNodeRight = Math.max(...[...m.nodes.values()].map(n => m.cx.get(n.id)! + n.w / 2));
    // The arc leaves through a gutter outside the node column. It previously
    // dipped below the whole graph and came back up, which made the SVG tall
    // and read as a lasso rather than a loop.
    expect(Math.max(...xs)).toBeGreaterThan(maxNodeRight);
    expect((svg.match(/is-back-edge/g) || []).length).toBe(1);
  });

  test('TB return arc does not pass through a node it does not terminate on', () => {
    const m = diagramParse('flowchart TB\n A[One]\n B[Two]\n C[Three]\n A --> B\n B --> C\n C --> A');
    diagramLayout(m);
    const geo = resolveGeometry(m, 'TB');
    const back = geo.edges.find(e => e.edge.isBackEdge);
    expect(back).toBeDefined();
    expect(edgeNodeCollisions(back!.route, geo.nodes)).toEqual([]);
  });

  test('LR back-edge is drawn as a return arc below the graph', () => {
    const m = diagramParse('flowchart LR\n A[One]\n B[Two]\n A --> B\n B --> A');
    diagramLayout(m);
    const svg = diagramBuildSvg(m, 'Loop');
    const backD = /class="edge-path is-back-edge" d="([^"]+)"/.exec(svg);
    expect(backD).not.toBeNull();
    const nums = extractNums(backD![1]);
    const ys = nums.filter((_, i) => i % 2 === 1);
    const maxNodeBottom = Math.max(
      ...[...m.nodes.values()].map(n => m.lrCy!.get(n.id)! + n.h / 2)
    );
    // A left-to-right loop cannot exit sideways without cutting across the
    // intervening ranks, so it is routed under the whole graph instead.
    expect(Math.max(...ys)).toBeGreaterThan(maxNodeBottom);
    expect((svg.match(/is-back-edge/g) || []).length).toBe(1);
  });

  test('LR return arc does not pass through a node it does not terminate on', () => {
    const m = diagramParse('flowchart LR\n A[One]\n B[Two]\n C[Three]\n A --> B\n B --> C\n C --> A');
    diagramLayout(m);
    const geo = resolveGeometry(m, 'LR');
    const back = geo.edges.find(e => e.edge.isBackEdge);
    expect(back).toBeDefined();
    expect(edgeNodeCollisions(back!.route, geo.nodes)).toEqual([]);
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

  test('self-loop returns into the node edge rather than past its corner', () => {
    const m = diagramParse('flowchart TB\n A[Self] --> A');
    diagramLayout(m);
    const geo = resolveGeometry(m, 'TB');
    const self = geo.edges[0];
    const last = self.route.points[self.route.points.length - 1];
    const node = geo.nodes[0];
    // The head must land on the node's own boundary. It previously stopped
    // short of it, in empty space beside the corner.
    expect(Math.abs(last.x - (node.cx + node.node.w / 2))).toBeLessThan(0.5);
    expect(last.y).toBeLessThanOrEqual(node.box.maxY);
    expect(last.y).toBeGreaterThanOrEqual(node.box.minY);
  });

  test('normal edges do not carry the back-edge class', () => {
    const m = diagramParse('flowchart TB\n A[One]\n B[Two]\n A --> B');
    diagramLayout(m);
    const svg = diagramBuildSvg(m, 'DAG');
    expect(svg).not.toContain('is-back-edge');
  });
});
