import { buildCss, computeLuminosityParams } from '../src/renderer/css.js';
import { buildJs } from '../src/renderer/js.js';
import { substituteTokens } from '../src/util/template-loader.js';

describe('renderer / CSS & JS builders', () => {
  test('computeLuminosityParams returns expected keys for dark/light', () => {
    const params = computeLuminosityParams({ dark: 0.1, light: 0.9 });
    expect(params.darkBg).toBeDefined();
    expect(params.lightBg).toBeDefined();
    expect(params.darkBgMixPct).toBeGreaterThan(0);
    expect(params.lightBgMixPct).toBeGreaterThan(0);
  });

  test('buildCss substitutes all __TOKENS__ without leaving placeholders', () => {
    const css = buildCss('#3b82f6', '59,130,246', { dark: 0.08, light: 0.96 });
    expect(css).toContain('#3b82f6');
    expect(css).not.toContain('__ACCENT__');
    expect(css).not.toContain('__ACCENT_RGB__');
    expect(css).not.toContain('__BASE_DARK_BG__');
    expect(css).not.toContain('__BASE_LIGHT_BG__');
  });

  test('buildJs accepts string accent and options object', () => {
    const jsFromStr = buildJs('#3b82f6');
    expect(jsFromStr).toContain('#3b82f6');
    expect(jsFromStr).not.toContain('__ACCENT__');

    const jsFromOpts = buildJs({
      accent: '#ef4444',
      routes: { intro: 'Introduction' },
      theme: 'light',
    });
    expect(jsFromOpts).toContain('#ef4444');
    expect(jsFromOpts).toContain('Introduction');
    expect(jsFromOpts).not.toContain('__ACCENT__');
    expect(jsFromOpts).not.toContain('__ROUTES__');
  });

  test('substituteTokens handles string and function replacers', () => {
    const tpl = 'Hello __NAME__, your code is __CODE__!';
    const result = substituteTokens(tpl, {
      __NAME__: 'Alice',
      __CODE__: () => 'XYZ-123',
    });
    expect(result).toBe('Hello Alice, your code is XYZ-123!');
  });
});
