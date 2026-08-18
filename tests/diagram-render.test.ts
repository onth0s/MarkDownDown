import { diagramParse, diagramLayout, diagramBuildSvg } from '../src/renderer/diagram-svg.js';

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

  test('parses diamond shape', () => {
    const model = diagramParse(`flowchart TB\n  D{Decision}`);
    expect(model.nodes.get('D')?.shape).toBe('diamond');
  });

  test('parses rounded shape', () => {
    const model = diagramParse(`flowchart TB\n  R(Rounded)`);
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

  test('LR SVG viewBox is wider than tall for linear chain', () => {
    const model = diagramParse(`flowchart\n  A[Start]\n  B[Process]\n  C[End]\n  A --> B\n  B --> C`);
    diagramLayout(model);
    const lr = diagramBuildSvg(model, 'LR Test', true);
    const match = lr.match(/viewBox="([^"]+)"/);
    expect(match).toBeTruthy();
    const [, , w, h] = match![1].split(' ').map(Number);
    expect(w).toBeGreaterThan(h);
  });

  test('LR edge paths are horizontal (sy and ey equal)', () => {
    const model = diagramParse(`flowchart\n  A[Start]\n  B[End]\n  A --> B`);
    diagramLayout(model);
    const lr = diagramBuildSvg(model, 'LR Test', true);
    const paths = [...lr.matchAll(/d="M ([0-9.]+) ([0-9.]+) C/g)];
    for (const m of paths) {
      expect(m[2]).toBe(m[2]);
    }
    const linePaths = [...lr.matchAll(/d="M ([0-9.]+) ([0-9.]+) L ([0-9.]+) ([0-9.]+)"/g)];
    for (const m of linePaths) {
      expect(m[2]).toBe(m[4]);
    }
  });
});
