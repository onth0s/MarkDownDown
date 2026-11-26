import { buildCss } from '../src/renderer/css.js';
import { buildJs } from '../src/renderer/js.js';

describe('responsive CSS and inline KaTeX invariants', () => {
  test('declares --svg-min-w in :root and keeps base .toolbar non-shrinking', () => {
    const css = buildCss('#3b82f6', '59, 130, 246');
    expect(css).toMatch(/:root\s*\{[^}]*--svg-min-w:\s*0px/);
    expect(css).toMatch(/\.toolbar\s*\{[^}]*flex:\s*none/);
    expect(css).toContain('.katex--overflow');
  });

  test('every var(--x) in rendered CSS resolves to a declared custom property', () => {
    const css = buildCss('#3b82f6', '59, 130, 246');
    const declared = new Set<string>();
    for (const m of css.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)) {
      declared.add(m[1]);
    }
    const undefinedVars: string[] = [];
    for (const m of css.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)) {
      if (!declared.has(m[1])) {
        undefinedVars.push(m[1]);
      }
    }
    expect(undefinedVars).toEqual([]);
  });

  test('renders fitInlineMath runtime promotion with resize and fonts.ready hooks', () => {
    const js = buildJs('#3b82f6');
    expect(js).toContain('fitInlineMath');
    expect(js).toContain('katex--overflow');
    expect(js).toContain('document.fonts.ready');
  });
});
