import { parseInlineMarkdown, stripMarkdown, renderFormattedTspans } from '../src/renderer/inline-markdown.js';
import { measureInline, measureText } from '../src/renderer/text-metrics.js';
import { tableParse, tableBuildSvg } from '../src/renderer/table-svg.js';
import { diagramParse, diagramLayout, diagramBuildSvg } from '../src/renderer/diagram/index.js';

describe('inline-markdown parser', () => {
  test('parses plain text without tokens', () => {
    const spans = parseInlineMarkdown('Simple plain text');
    expect(spans).toEqual([{ text: 'Simple plain text' }]);
  });

  test('parses bold tokens (** and __)', () => {
    expect(parseInlineMarkdown('**bold text**')).toEqual([
      { text: 'bold text', bold: true },
    ]);
    expect(parseInlineMarkdown('__bold text__')).toEqual([
      { text: 'bold text', bold: true },
    ]);
  });

  test('parses italic tokens (* and _)', () => {
    expect(parseInlineMarkdown('*italic text*')).toEqual([
      { text: 'italic text', italic: true },
    ]);
    expect(parseInlineMarkdown('_italic text_')).toEqual([
      { text: 'italic text', italic: true },
    ]);
  });

  test('parses inline code (`code`)', () => {
    expect(parseInlineMarkdown('`code snippet`')).toEqual([
      { text: 'code snippet', code: true },
    ]);
  });

  test('parses strikethrough (~~text~~)', () => {
    expect(parseInlineMarkdown('~~deprecated~~')).toEqual([
      { text: 'deprecated', strike: true },
    ]);
  });

  test('parses bold inline code (**`Alt+1`**)', () => {
    expect(parseInlineMarkdown('**`Alt+1`**')).toEqual([
      { text: 'Alt+1', bold: true, code: true },
    ]);
  });

  test('parses italic inline code (*`Alt+1`*)', () => {
    expect(parseInlineMarkdown('*`Alt+1`*')).toEqual([
      { text: 'Alt+1', italic: true, code: true },
    ]);
  });

  test('parses mixed text with multiple formats', () => {
    const spans = parseInlineMarkdown('Prefix **`Ctrl+Enter`** then *italic* and normal');
    expect(spans).toEqual([
      { text: 'Prefix ' },
      { text: 'Ctrl+Enter', bold: true, code: true },
      { text: ' then ' },
      { text: 'italic', italic: true },
      { text: ' and normal' },
    ]);
  });

  test('parses nested formatting inside bold (**bold with *italic* inside**)', () => {
    const spans = parseInlineMarkdown('**bold with *italic* inside**');
    expect(spans).toEqual([
      { text: 'bold with ', bold: true },
      { text: 'italic', bold: true, italic: true },
      { text: ' inside', bold: true },
    ]);
  });

  test('stripMarkdown removes delimiters', () => {
    expect(stripMarkdown('**`Alt+1, F` / `F3`**')).toBe('Alt+1, F / F3');
    expect(stripMarkdown('~~old~~ and *new* and `code`')).toBe('old and new and code');
  });

  test('measureInline charges code spans at the monospace rate, not the parent rate', () => {
    // A `code` span is set in the monospace stack, so it must be measured
    // against those advances. Measuring it at the parent's rate was how a
    // subtitle containing inline code ended up wider than its own node.
    const asCode = measureInline('`Alt+1`', 10, {});
    const asProse = measureText('Alt+1', 10, {});
    expect(asCode).toBe(measureText('Alt+1', 10, { mono: true }));
    expect(asCode).toBeGreaterThan(asProse);
  });

  test('measureInline ignores delimiter characters', () => {
    expect(measureInline('**Alt+1**', 10, { bold: true })).toBe(
      measureText('Alt+1', 10, { bold: true })
    );
  });

  test('measureText scales with the real font, not a flat per-character rate', () => {
    // "iiiii" is five narrow stems; "MMMMM" is five wide ones. A flat
    // per-character rate gives them the same width, which is the bug that made
    // node boxes the wrong size.
    expect(measureText('MMMMM', 10)).toBeGreaterThan(measureText('iiiii', 10) * 3);
  });

  test('renderFormattedTspans outputs tspans with classes and styles', () => {
    const svgText = renderFormattedTspans('**`Alt+1`**', { codeClass: 'tbl-code-span' });
    expect(svgText).toContain('<tspan');
    expect(svgText).toContain('class="tbl-code-span"');
    expect(svgText).toContain('font-weight="700"');
    expect(svgText).toContain('Alt+1');
    expect(svgText).not.toContain('**');
    expect(svgText).not.toContain('`');
  });
});

describe('table SVG with Markdown formatting', () => {
  test('renders bold code shortcuts without raw markdown syntax in output', () => {
    const src = `TITLE: Shortcuts\n| Input | Action |\n| :--- | :--- |\n| **\`Alt+1\`** | Leader mode |\n| *italic* | Description |`;
    const model = tableParse(src);
    const svg = tableBuildSvg(model, 'Shortcuts');

    expect(svg).toContain('<tspan class="tbl-code-span" font-family="monospace" font-weight="700">Alt+1</tspan>');
    expect(svg).toContain('<tspan font-style="italic">italic</tspan>');
    expect(svg).not.toContain('**`Alt+1`**');
  });

  test('preserves data-label-ord on cells with formatted text', () => {
    const src = `| Key |\n| :--- |\n| **\`Ctrl+C\`** |`;
    const model = tableParse(src);
    const svg = tableBuildSvg(model, 'Test');
    expect(svg).toContain('data-label-ord="0"');
    expect(svg).toContain('data-label-ord="1"');
  });
});

describe('diagram SVG with Markdown formatting', () => {
  test('renders markdown in node labels and subtitles', () => {
    const src = 'flowchart TB\n  A["**Engine** — *v1.0*"] --> B["`Worker`"]';
    const model = diagramParse(src);
    diagramLayout(model);
    const svg = diagramBuildSvg(model, 'Diagram');

    expect(svg).toContain('class="diag-code-span"');
    expect(svg).toContain('Worker');
    expect(svg).not.toContain('`Worker`');
    expect(svg).toContain('Engine');
    expect(svg).toContain('v1.0');
  });

  test('renders markdown in edge labels', () => {
    const src = 'flowchart TB\n  A -->|**`triggers`**| B';
    const model = diagramParse(src);
    diagramLayout(model);
    const svg = diagramBuildSvg(model, 'Diagram');

    expect(svg).toContain('class="diag-code-span"');
    expect(svg).toContain('triggers');
    expect(svg).not.toContain('**`triggers`**');
  });

  test('preserves snake_case identifiers without unwanted italicization', () => {
    const spans = parseInlineMarkdown('user_profile_id and _italic_ text');
    expect(spans).toEqual([
      { text: 'user_profile_id and ' },
      { text: 'italic', italic: true },
      { text: ' text' },
    ]);
  });
});
