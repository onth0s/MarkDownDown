import { compile } from '../src/compile.js';
import { buildCss } from '../src/renderer/css.js';
import { diagramParse, diagramLayout, diagramBuildSvg } from '../src/renderer/diagram/index.js';
import { measureInline, wrapToWidth } from '../src/renderer/text-metrics.js';
import { DIAGRAM } from '../src/constants.js';
import type { Options } from '../src/types.js';

describe('Diagram Auto-Responsiveness', () => {
  const baseOptions: Options = {
    inputFile: 'test.mdd',
    outputPath: 'test.html',
    outputMode: 'single',
    accent: '#dc2626',
    assetsDir: './assets',
    title: 'Warfare Levels Test',
    noDiagrams: false,
    noTables: false,
    verbose: false,
  };

  test('emits dual diagram-tb and diagram-lr SVGs inside diagram-auto container for 2-node comparison', () => {
    const rawSource = `---
title: "The Two Levels of Warfare"
accent: "#dc2626"
---

# The Two Levels of Warfare

\`\`\`diagram
TITLE: The Two Levels of Warfare

TACTICAL["TACTICAL LEVEL — The Soldier / Rambo: Absolute force, decisive victory, 'Win at all costs'"]

STRUCTURAL["STRUCTURAL LEVEL — The State / Politicians: Strategic alliances, domestic politics, long-term survival"]

TACTICAL -->|VS| STRUCTURAL
\`\`\`
`;

    const res = compile({ ...baseOptions, rawSource });

    // Assert wrapper has diagram-auto class
    expect(res.html).toContain('class="code-wrap diagram diagram-auto"');

    // Assert both TB and LR wrappers are emitted
    expect(res.html).toContain('<div class="diagram-tb">');
    expect(res.html).toContain('<div class="diagram-lr">');

    // Extract both SVGs
    const tbMatch = res.html.match(/<div class="diagram-tb">\s*(<svg[^>]+>[\s\S]*?<\/svg>)\s*<\/div>/);
    const lrMatch = res.html.match(/<div class="diagram-lr">\s*(<svg[^>]+>[\s\S]*?<\/svg>)\s*<\/div>/);
    expect(tbMatch).toBeTruthy();
    expect(lrMatch).toBeTruthy();

    const tbSvg = tbMatch![1];
    const lrSvg = lrMatch![1];

    const tbWMatch = tbSvg.match(/width="(\d+)"/);
    const tbHMatch = tbSvg.match(/height="(\d+)"/);
    const lrWMatch = lrSvg.match(/width="(\d+)"/);
    const lrHMatch = lrSvg.match(/height="(\d+)"/);

    expect(tbWMatch).toBeTruthy();
    expect(tbHMatch).toBeTruthy();
    expect(lrWMatch).toBeTruthy();
    expect(lrHMatch).toBeTruthy();

    const tbW = Number(tbWMatch![1]);
    const tbH = Number(tbHMatch![1]);
    const lrW = Number(lrWMatch![1]);
    const lrH = Number(lrHMatch![1]);

    // TB SVG is a vertical stack: narrower width (single node column).
    // 411x286 is the node box (363 wide, sized to the longest measured line
    // plus padding) plus 24 of padding per side, with two 91-tall boxes stacked
    // 56 apart. These are exact because they follow from the text measurement;
    // the point of the assertion is that the box tracks the text, which is why
    // the value shrank when the flat per-character rate was replaced with
    // per-glyph advances.
    expect(tbW).toBe(411);
    expect(tbH).toBe(286);

    // LR SVG is a horizontal flow: width is substantially wider than height and wider than TB
    expect(lrW).toBeGreaterThan(lrH);
    expect(lrW).toBeGreaterThan(tbW);
    expect(lrW).toBe(854);
  });

  test('surrounding quotes are delimiters, not label content', () => {
    // DSL.md's own examples write `NODE["Title — Subtitle"]`, so the quotes
    // are quoting syntax. Straight quotes were already stripped; curly ones
    // were not, so `“Pipeline Orchestrator …”` rendered with the curly quotes
    // sitting inside the node text.
    const m = diagramParse(
      'TB\n' +
      'A["plain straight"]\n' +
      'B[“curly double”]\n' +
      'C(‘curly single’)\n' +
      'D{“curly diamond”}'
    );
    expect(m.nodes.get('A')!.label).toBe('plain straight');
    expect(m.nodes.get('B')!.label).toBe('curly double');
    expect(m.nodes.get('C')!.label).toBe('curly single');
    expect(m.nodes.get('D')!.label).toBe('curly diamond');
  });

  test('an unpaired quote inside a label is kept as content', () => {
    // Only a matching outer pair is a delimiter. A label that merely happens
    // to start with a quote, or that contains a nested quoted phrase, must not
    // be truncated.
    const m = diagramParse('TB\n A["He said "hi" loudly"]\n B[it\'s fine]');
    expect(m.nodes.get('A')!.label).toBe('He said "hi" loudly');
    expect(m.nodes.get('B')!.label).toBe("it's fine");
  });

  test('single quotes do not delimit a rect label', () => {
    // `A['quoted']` used to render with its apostrophes. The rect form is
    // written `A["quoted"]`, and only `"` ever delimited it, so extending `'`
    // to rects would silently eat the apostrophes in a label like this.
    const m = diagramParse("TB\n A['quoted']\n B('rounded single')\n C{'diamond single'}");
    expect(m.nodes.get('A')!.label).toBe("'quoted'");
    expect(m.nodes.get('B')!.label).toBe('rounded single');
    expect(m.nodes.get('C')!.label).toBe('diamond single');
  });

  test('an empty or blank label is not a node definition', () => {
    // `A[]` was ignored before. Accepting it draws a box with no text element
    // in it at all — a blank rectangle the reader cannot interpret. Ignoring
    // the line means an edge that references A still produces node A, bare.
    const m = diagramParse('TB\n A[]\n B[  ]\n C[]\n D[real]\n A --> B\n B --> C\n C --> D');
    expect(m.nodes.size).toBe(4);
    expect(m.nodes.get('A')!.label).toBe('A');
    expect(m.nodes.get('D')!.label).toBe('real');
  });

  test('a quote pair that would strip to nothing is kept as the label', () => {
    // `A['']` means the two-character label `''`, not an empty label.
    const m = diagramParse('TB\n A[\'\']\n B[""]\n C[""]');
    expect(m.nodes.get('A')!.label).toBe("''");
    expect(m.nodes.get('B')!.label).toBe('""');
  });

  test('every node in a parsed diagram emits a text element', () => {
    // The blank-box failure mode above, asserted structurally rather than by
    // re-deriving it: a node group with a rect but no <text> is always a bug.
    for (const src of ['TB\n A[]\n B[ok]', 'TB\n A[ ]\n B[ok]', "TB\n A['']\n B[ok]"]) {
      const m = diagramParse(src);
      diagramLayout(m);
      const svg = diagramBuildSvg(m, 'T');
      const groups = [...svg.matchAll(/<g class="node"[^>]*>([\s\S]*?)<\/g>/g)].map(x => x[1]!);
      expect(groups.length).toBeGreaterThan(0);
      for (const g of groups) expect(g).toContain('<text');
    }
  });

  test('node box is never narrower than the text measured inside it', () => {
    // The real invariant behind the pixel values above: whatever the text
    // measures, the box has to hold it. A flat per-character rate used to
    // over-measure prose by 30-55% and under-measure ALL-CAPS, so this failed
    // in both directions.
    const m = diagramParse(`TITLE: Metrics

LOWER[enrichment, and final distribution]
UPPER[QUEUE — COMPLETED]
WIDE[MMMMMMMMMMMMMMMMMMMM]
NARROW[iiiiiiiiiiiiiiiiiiiii]`);
    diagramLayout(m);

    for (const node of m.nodes.values()) {
      const metrics = node.metrics!;
      const innerW = node.w - 2 * DIAGRAM.PADX;
      for (const line of metrics.lines) {
        expect(line.width).toBeLessThanOrEqual(innerW);
      }
      expect(metrics.textWidth).toBeLessThanOrEqual(node.w);
    }
  });

  test('wrapToWidth hard-breaks a token longer than the limit', () => {
    // The old wrapper returned an over-long single word verbatim. The caller
    // then clamped the box to MAX_W, and the text was drawn wider than its own
    // node and clipped by the viewBox.
    const long = 'A'.repeat(120);
    const lines = wrapToWidth(long, 16, 200, { bold: true });
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(measureInline(line, 16, { bold: true })).toBeLessThanOrEqual(200);
    }
  });

  test('measured text width reflects glyph advances, not character count', () => {
    // Both labels are 10 characters and fit on one line, so only the glyph
    // advances can tell them apart. A flat per-character rate gave identical
    // widths.
    const m = diagramParse('TB\n A[MMMMMMMMMM]\n B[iiiiiiii]');
    diagramLayout(m);
    expect(m.nodes.get('A')!.metrics!.textWidth)
      .toBeGreaterThan(m.nodes.get('B')!.metrics!.textWidth * 4);

    // And the same holds through the wrapper, at a length where both fit on one
    // line so only the measured width can tell them apart.
    const wide = wrapToWidth('MMMMMMMMMM', 16, 400, { bold: true });
    const narrow = wrapToWidth('iiiiiiiiii', 16, 400, { bold: true });
    expect(wide.length).toBe(1);
    expect(narrow.length).toBe(1);
    expect(measureInline(wide[0], 16, { bold: true }))
      .toBeGreaterThan(measureInline(narrow[0], 16, { bold: true }) * 3);
  });

  test('CSS rules switch between diagram-tb on mobile and diagram-lr on desktop', () => {
    const css = buildCss('#dc2626', '220,38,38');

    // Base rules (mobile default)
    expect(css).toMatch(/\.diagram-auto \.diagram-lr\s*\{\s*display:\s*none;?\s*\}/);
    expect(css).toMatch(/\.diagram-auto \.diagram-tb\s*\{\s*display:\s*block;?\s*\}/);

    // Responsive breakpoint: desktop switch
    expect(css).toMatch(/@media\s*\(\s*min-width:\s*768px\s*\)\s*\{[\s\S]*?\.diagram-auto \.diagram-tb\s*\{\s*display:\s*none;?\s*\}[\s\S]*?\.diagram-auto \.diagram-lr\s*\{\s*display:\s*block;?\s*\}[\s\S]*?\}/);
  });

  test('gracefully compiles hallucinated diagram auto fence with undirected quoted pipe label', () => {
    const rawSource = `---
title: "Hallucination Resilience Test"
accent: "#dc2626"
---

\`\`\`diagram auto
TITLE: The Two Levels of Warfare
TACTICAL["TACTICAL LEVEL — The Soldier / Rambo: Absolute force, decisive victory, 'Win at all costs'"]
STRUCTURAL["STRUCTURAL LEVEL — The State / Politicians: Strategic alliances, domestic politics, long-term survival"]

TACTICAL ---|"VS."| STRUCTURAL
\`\`\`
`;

    const res = compile({ ...baseOptions, rawSource });

    expect(res.html).toContain('class="code-wrap diagram diagram-auto"');
    expect(res.html).toContain('<div class="diagram-tb">');
    expect(res.html).toContain('<div class="diagram-lr">');
    expect(res.html).toContain('VS.');
    // Check that quotes were stripped from the label in SVG
    expect(res.html).not.toContain('"VS."');
  });
});
