import { compile } from '../src/compile.js';
import { buildCss } from '../src/renderer/css.js';
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

    // TB SVG is a vertical stack: narrower width (single node column)
    expect(tbW).toBe(448);
    expect(tbH).toBe(340);

    // LR SVG is a horizontal flow: width is substantially wider than height and wider than TB
    expect(lrW).toBeGreaterThan(lrH);
    expect(lrW).toBeGreaterThan(tbW);
    expect(lrW).toBe(928);
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
