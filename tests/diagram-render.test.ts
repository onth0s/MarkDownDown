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
});
