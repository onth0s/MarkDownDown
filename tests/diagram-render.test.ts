import { diagramParse, diagramLayout, diagramBuildSvg, validateNoNodeOverlap } from '../src/renderer/diagram-svg.js';

describe('diagramParse', () => {
  test('parses flowchart with direction', () => {
    const model = diagramParse(`flowchart TB\n  A[Node A]\n  B[Node B]\n  A --> B`);
    expect(model.direction).toBe('TB');
    expect(model.nodes.size).toBe(2);
    expect(model.edges.length).toBe(1);
  });

  test('parses directed edge with label', () => {
    const model = diagramParse(`flowchart LR\n  A -->|edge label| B`);
    expect(model.direction).toBe('LR');
    expect(model.edges[0].label).toBe('edge label');
    expect(model.edges[0].directed).toBe(true);
  });

  test('parses undirected edge', () => {
    const model = diagramParse(`flowchart TB\n  A --- B`);
    expect(model.edges[0].directed).toBe(false);
  });

  test('handles TITLE: directive', () => {
    // TITLE: is stripped before passing to diagramParse
    const model = diagramParse(`flowchart TB\n  A[Test]\n  B[Other]\n  A --> B`);
    expect(model.nodes.size).toBe(2);
  });

  test('strips %% comments', () => {
    const model = diagramParse(`flowchart TB\n  %% This is a comment\n  A[Node]\n  B[Node2]\n  A --> B`);
    expect(model.nodes.size).toBe(2);
  });

  test('parses diagram with no header at all', () => {
    const model = diagramParse(`A[Node A] --> B[Node B]`);
    expect(model.direction).toBe('auto');
    expect(model.nodes.size).toBe(2);
    expect(model.edges.length).toBe(1);
  });

  test('parses diagram with bare direction token', () => {
    const model = diagramParse(`LR\n  A --> B`);
    expect(model.direction).toBe('LR');
    expect(model.nodes.size).toBe(2);
  });

  test('parses diagram with DIRECTION: directive', () => {
    const model = diagramParse(`DIRECTION: RL\n  A --> B`);
    expect(model.direction).toBe('RL');
    expect(model.nodes.size).toBe(2);
  });

  test('parses diamond shape', () => {
    const model = diagramParse(`D{Decision}`);
    expect(model.nodes.get('D')?.shape).toBe('diamond');
  });

  test('parses rounded shape', () => {
    const model = diagramParse(`R(Rounded)`);
    expect(model.nodes.get('R')?.shape).toBe('rounded');
  });
});

describe('diagramLayout + diagramBuildSvg', () => {
  test('builds valid SVG string', () => {
    const model = diagramParse(`flowchart TB\n  A[Alpha]\n  B[Beta]\n  A --> B`);
    diagramLayout(model);
    const svg = diagramBuildSvg(model, 'Test Diagram');
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-label="Test Diagram"');
  });

  test('SVG contains node text', () => {
    const model = diagramParse(`flowchart TB\n  A[Alpha Node]\n  B[Beta Node]\n  A --> B`);
    diagramLayout(model);
    const svg = diagramBuildSvg(model, 'Test');
    expect(svg).toContain('Alpha');
    expect(svg).toContain('Beta');
  });

  test('empty model produces SVG with no nodes', () => {
    const model = diagramParse('flowchart TB');
    diagramLayout(model);
    expect(model.nodes.size).toBe(0);
  });

  test('handles diamond and rounded shapes in SVG', () => {
    const model = diagramParse(`flowchart TB\n  D{Decision}\n  R(Rounded)\n  D --> R`);
    diagramLayout(model);
    const svg = diagramBuildSvg(model, 'Shapes');
    expect(svg).toContain('Decision');
    expect(svg).toContain('Rounded');
  });

  test('handles edge labels in SVG', () => {
    const model = diagramParse(`flowchart TB\n  A[Start] -->|yes| B[End]`);
    diagramLayout(model);
    const svg = diagramBuildSvg(model, 'Edges');
    expect(svg).toContain('yes');
  });

  test('handles undirected edges', () => {
    const model = diagramParse(`flowchart TB\n  A[Alpha] --- B[Beta]`);
    diagramLayout(model);
    const svg = diagramBuildSvg(model, 'Undirected');
    expect(svg).toContain('Alpha');
  });

  test('builds valid LR SVG via forceLR', () => {
    const model = diagramParse(`flowchart TB\n  A[Alpha]\n  B[Beta]\n  A --> B`);
    diagramLayout(model);
    const svg = diagramBuildSvg(model, 'LR Test', true);
    expect(svg).toContain('<svg');
    expect(svg).toContain('Alpha');
    expect(svg).toContain('Beta');
  });

  test('parser defaults to auto when no direction specified', () => {
    const model = diagramParse(`flowchart\n  A[Node A]\n  B[Node B]\n  A --> B`);
    expect(model.direction).toBe('auto');
    expect(model.horizontal).toBe(false);
  });

  test('parser still accepts explicit LR direction', () => {
    const model = diagramParse(`flowchart LR\n  A[Alpha]\n  B[Beta]\n  A --> B`);
    expect(model.direction).toBe('LR');
    diagramLayout(model);
    expect(model.horizontal).toBe(true);
  });

  test('LR SVG width > height for linear chain', () => {
    const model = diagramParse(`flowchart\n  A[Start]\n  B[Process]\n  C[End]\n  A --> B\n  B --> C`);
    diagramLayout(model);
    const lr = diagramBuildSvg(model, 'LR Test', true);
    const wMatch = lr.match(/width="(\d+)"/);
    const hMatch = lr.match(/height="(\d+)"/);
    expect(wMatch).toBeTruthy();
    expect(hMatch).toBeTruthy();
    expect(Number(wMatch![1])).toBeGreaterThan(Number(hMatch![1]));
  });

  test('dynamically resolves long chain in auto mode to TB', () => {
    const model = diagramParse(`flowchart
      A["Input Document — Source file"]
      B["Frontmatter — Options"]
      C["Lexer — Tokens"]
      D["Resolver — Headings"]
      E["Renderer — SVG"]
      F["Assembler — Shell"]
      G["Output — HTML"]
      A --> B
      B --> C
      C --> D
      D --> E
      E --> F
      F --> G
    `);
    expect(model.direction).toBe('auto');
    diagramLayout(model);
    expect(model.direction).toBe('TB');
    expect(model.horizontal).toBe(false);
  });

  test('dynamically resolves 5-node snapping pipeline in auto mode to TB', () => {
    const model = diagramParse(`
      A["Raw Pointer Movement"]
      B["Extract Box Bounding Rect"]
      C["Proximity Math Filter in Threshold Check (<= 4px) — Is Target Found?"]
      D["Apply Snap — Coordinates"]
      E["Inject Guide Paths into UI Store"]
      A --> B
      B --> C
      C --> D
      D --> E
    `);
    expect(model.direction).toBe('auto');
    diagramLayout(model);
    expect(model.direction).toBe('TB');
    expect(model.horizontal).toBe(false);
  });

  test('throws compilation error when nodes overlap in layout', () => {
    const model = diagramParse(`flowchart TB\n  A[Node A]\n  B[Node B]`);
    // Manually force overlapping coordinates to verify error
    model.nodes.get('A')!.w = 200;
    model.nodes.get('A')!.h = 100;
    model.nodes.get('B')!.w = 200;
    model.nodes.get('B')!.h = 100;
    model.cx.set('A', 100);
    model.cy.set('A', 100);
    model.cx.set('B', 120);
    model.cy.set('B', 110);
    expect(() => {
      validateNoNodeOverlap(model, false);
    }).toThrow(/Diagram compilation error: nodes "(A|B)" and "(A|B)" overlap in layout\./);
  });
});

describe('diagram render determinism', () => {
  test('same source produces byte-identical SVG across builds', () => {
    const src = `flowchart TB\n  A[One]\n  B[Two]\n  A --> B\n  B --> A`;
    const first = diagramBuildSvg(diagramLayoutAndParse(src), 'Loop');
    const second = diagramBuildSvg(diagramLayoutAndParse(src), 'Loop');
    expect(second).toBe(first);
  });

  test('arrow marker id is derived deterministically from model content', () => {
    const srcA = `flowchart TB\n  A[One]\n  B[Two]\n  A --> B`;
    const srcB = `flowchart TB\n  A[One]\n  B[Two]\n  A --> B`;
    const svgA = diagramBuildSvg(diagramLayoutAndParse(srcA), 'Loop');
    const svgB = diagramBuildSvg(diagramLayoutAndParse(srcB), 'Loop');
    expect(svgA).toBe(svgB);
    expect(svgA).toMatch(/marker id="arrow-[0-9a-f]{8}"/);
  });

  test('auto mode gives distinct markers for TB and LR variants', () => {
    const src = `flowchart TB\n  A[One]\n  B[Two]\n  A --> B`;
    const model = diagramLayoutAndParse(src);
    const svgTB = diagramBuildSvg(model, 'Loop', false);
    const svgLR = diagramBuildSvg(model, 'Loop', true);
    const idTB = /marker id="(arrow-[0-9a-f]{8})"/.exec(svgTB)![1];
    const idLR = /marker id="(arrow-[0-9a-f]{8})"/.exec(svgLR)![1];
    expect(idTB).not.toBe(idLR);
  });
});

function diagramLayoutAndParse(src: string) {
  const m = diagramParse(src);
  diagramLayout(m);
  return m;
}

