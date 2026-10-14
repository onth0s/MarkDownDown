import { tableParse, tableBuildSvg } from '../src/renderer/table-svg.js';
import { parseInlineMarkdown } from '../src/renderer/inline-markdown.js';
import { wrapSpansToWidth, wrapToWidth } from '../src/renderer/text-metrics.js';

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

describe('tableParse pipe escapes', () => {
  test('pipes inside inline code spans do not split cells', () => {
    const model = tableParse(`| Fact | Value (source) |
|---|---|
| Placeholders | \`<|image|>\`, \`<|video|>\`, \`<|audio|>\` mark media positions in text (HF card) |`);
    expect(model.headers).toEqual(['Fact', 'Value (source)']);
    expect(model.rows.length).toBe(1);
    expect(model.rows[0].length).toBe(2);
    expect(model.rows[0][0]).toBe('Placeholders');
    expect(model.rows[0][1]).toContain('<|image|>');
    expect(model.rows[0][1]).toContain('<|video|>');
    expect(model.rows[0][1]).toContain('<|audio|>');
  });

  test('backslash-escaped pipes do not split cells', () => {
    const model = tableParse(`| A | B |\n|---|---|\n| f\\|oo | bar |`);
    expect(model.rows.length).toBe(1);
    expect(model.rows[0]).toEqual(['f|oo', 'bar']);
  });

  test('double-backslash before a pipe still delimits', () => {
    const model = tableParse(`| A | B |\n|---|---|\n| a\\\\ | b |`);
    expect(model.rows.length).toBe(1);
    expect(model.rows[0]).toEqual(['a\\', 'b']);
  });

  test('double-backtick code spans protect pipes', () => {
    const model = tableParse('| A | B |\n|---|---|\n| ``a|b`` | c |');
    expect(model.rows.length).toBe(1);
    expect(model.rows[0]).toEqual(['``a|b``', 'c']);
  });

  test('label offsets still point at cell text', () => {
    const src = `| Fact | Value |\n|---|---|\n| Placeholders | \`<|image|>\` ok |`;
    const model = tableParse(src);
    expect(model.rows[0].length).toBe(2);
    const ord = model.rowOrds[0][1];
    const label = model.labels.find((l) => l.ord === ord);
    expect(label).toBeDefined();
    expect(src.slice(label!.offset, label!.offset + 11)).toBe('`<|image|>`');
  });
});

describe('wrapSpansToWidth', () => {
  test('matches wrapToWidth line breaks for plain text', () => {
    const cases = [
      'Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu',
      'A supercalifragilisticexpialidocious token that must hard break somewhere',
      ' short ',
    ];
    for (const text of cases) {
      for (const maxW of [300, 276, 120, 40]) {
        const plain = wrapToWidth(text, 12, maxW, {});
        const spanned = wrapSpansToWidth(parseInlineMarkdown(text), 12, maxW, {});
        expect(spanned.map((l) => l.map((s) => s.text).join(''))).toEqual(plain);
      }
    }
  });

  test('carries code flags across wrapped lines', () => {
    const lines = wrapSpansToWidth(
      parseInlineMarkdown('`{"vision_config": None, "audio_config": None}`'),
      12,
      276,
      {}
    );
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(line.length).toBeGreaterThan(0);
      for (const s of line) expect(s.code).toBe(true);
    }
  });
});

describe('tableBuildSvg wrapped inline formatting', () => {
  test('code span split across wrapped lines keeps code styling on every line', () => {
    const model = tableParse(
      '| Load | config |\n|---|---|\n| Full | `{"vision_config": None, "audio_config": None}` |'
    );
    expect(model.rows[0].length).toBe(2);
    const svg = tableBuildSvg(model, 'Test');
    expect((svg.match(/tbl-code-span/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(svg).not.toContain('`');
    expect(svg).toContain('vision_config');
  });

  test('bold span split across wrapped lines keeps bold on every line', () => {
    const model = tableParse(
      '| A | B |\n|---|---|\n| x | **alpha beta gamma delta epsilon zeta eta theta iota kappa** |'
    );
    const svg = tableBuildSvg(model, 'Test');
    expect((svg.match(/<tspan[^>]*font-weight="700"/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(svg).not.toContain('**');
  });
});
