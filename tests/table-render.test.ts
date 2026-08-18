import { tableParse, tableBuildSvg } from '../src/renderer/table-svg.js';

describe('tableParse', () => {
  const sample = `| Column A | Column B | Column C |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |`;

  test('parses headers', () => {
    const model = tableParse(sample);
    expect(model.headers).toEqual(['Column A', 'Column B', 'Column C']);
  });

  test('parses rows', () => {
    const model = tableParse(sample);
    expect(model.rows.length).toBe(2);
    expect(model.rows[0]).toEqual(['Cell 1', 'Cell 2', 'Cell 3']);
  });

  test('skips separator row', () => {
    const model = tableParse(sample);
    expect(model.rows.every(r => r.every(c => !c.match(/^:?-+:?$/)))).toBe(true);
  });
});

describe('tableBuildSvg', () => {
  const model = tableParse(`| Name | Value |
|------|-------|
| Foo  | 42    |
| Bar  | 99    |`);

  test('produces valid SVG', () => {
    const svg = tableBuildSvg(model, 'Test Table');
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-label="Test Table"');
  });

  test('SVG contains header text', () => {
    const svg = tableBuildSvg(model, 'Test');
    expect(svg).toContain('Name');
    expect(svg).toContain('Value');
  });

  test('SVG contains cell text', () => {
    const svg = tableBuildSvg(model, 'Test');
    expect(svg).toContain('Foo');
    expect(svg).toContain('42');
    expect(svg).toContain('Bar');
  });

  test('SVG has correct dimensions in viewBox', () => {
    const svg = tableBuildSvg(model, 'Test');
    expect(svg).toMatch(/viewBox="0 0 [\d.]+ [\d.]+"/);
  });

  test('handles empty table (headers only, no rows)', () => {
    const headerOnly = tableParse(`| Col A | Col B |\n|-------|-------|`);
    const svg = tableBuildSvg(headerOnly, 'Empty');
    expect(svg).toContain('<svg');
    expect(svg).toContain('Col A');
  });

  test('handles single column table', () => {
    const single = tableParse(`| Item |\n|------|\n| One  |\n| Two  |`);
    const svg = tableBuildSvg(single, 'Single');
    expect(svg).toContain('Item');
    expect(svg).toContain('One');
    expect(svg).toContain('Two');
  });
});
