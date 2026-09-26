import { processLogo } from '../src/renderer/logo.js';
import { measureText } from '../src/renderer/text-metrics.js';
import fs from 'node:fs';
import path from 'node:path';

describe('Logo Processor Unit Tests', () => {
  const scratchDir = path.resolve(process.cwd(), 'scratch');

  test('returns default logo when no path or non-existent path is provided', () => {
    const warnings: string[] = [];
    const res = processLogo(undefined, '#3b82f6', warnings);
    expect(res.navbarLogo).toContain('class="brand-logo"');
    expect(res.navbarLogo).toContain('viewBox="0 0 1024 1024"');
    expect(res.faviconHref).toContain('data:image/svg+xml');
    expect(warnings.length).toBe(0);

    const resMissing = processLogo('non_existent_logo.svg', '#3b82f6', warnings);
    expect(resMissing.navbarLogo).toContain('class="brand-logo"');
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('Logo file not found');
  });

  test('default logo favicon computes proper fg contrast for #ffffff and #000000', () => {
    const resWhite = processLogo(undefined, '#ffffff');
    const whiteDecoded = decodeURIComponent(resWhite.faviconHref);
    expect(whiteDecoded).toContain('fill="#172033"');

    const resBlack = processLogo(undefined, '#000000');
    const blackDecoded = decodeURIComponent(resBlack.faviconHref);
    expect(blackDecoded).toContain('fill="#ffffff"');
  });

  test('processes custom SVG logo extracting viewBox, harmonizing hue and preserving lightness', () => {
    const svgPath = path.join(scratchDir, 'test-logo.svg');
    const svgContent = `<svg width="500" height="500" viewBox="0 0 500 500" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="250" cy="250" r="200" fill="#ff0000"/>
    </svg>`;
    fs.writeFileSync(svgPath, svgContent, 'utf8');

    try {
      // #10b981 is green (h: 160, s: 84%, l: 39%)
      // #ff0000 has lightness = 50%
      // Output for circle should have lightness 50% and hue 160
      const res = processLogo(svgPath, '#10b981');
      expect(res.navbarLogo).toContain('class="brand-logo"');
      expect(res.navbarLogo).toContain('viewBox="0 0 500 500"');
      expect(res.navbarLogo).toContain('fill="#14eba3" data-l="50"');
      expect(res.faviconTemplate).toContain('viewBox="0 0 500 500"');
      expect(res.faviconTemplate).toContain('fill="{L_50}"');
      expect(res.faviconHref).toContain('data:image/svg+xml');
    } finally {
      if (fs.existsSync(svgPath)) fs.unlinkSync(svgPath);
    }
  });

  test('processes custom SVG logo with named colors (stroke="black")', () => {
    const svgPath = path.join(scratchDir, 'test-black-logo.svg');
    const svgContent = `<svg width="400" height="400" viewBox="0 0 400 400" fill="none">
      <path d="M10 10 L100 100" stroke="black" stroke-width="20"/>
    </svg>`;
    fs.writeFileSync(svgPath, svgContent, 'utf8');

    try {
      const res = processLogo(svgPath, '#d10000');
      expect(res.navbarLogo).toContain('stroke="#d10000"');
      expect(res.navbarLogo).toContain('data-l="41"');
      expect(res.faviconTemplate).toContain('stroke="{L_41}"');
    } finally {
      if (fs.existsSync(svgPath)) fs.unlinkSync(svgPath);
    }
  });

  test('processes custom SVG logo with pure black accent (#000000)', () => {
    const svgPath = path.join(scratchDir, 'test-black-accent.svg');
    const svgContent = `<svg width="400" height="400" viewBox="0 0 400 400" fill="none">
      <path d="M10 10 L100 100" stroke="#000000" stroke-width="20"/>
    </svg>`;
    fs.writeFileSync(svgPath, svgContent, 'utf8');

    try {
      const res = processLogo(svgPath, '#000000');
      expect(res.navbarLogo).toContain('stroke="#000000"');
      expect(res.navbarLogo).toContain('data-l="0"');
    } finally {
      if (fs.existsSync(svgPath)) fs.unlinkSync(svgPath);
    }
  });

  test('processes custom SVG logo with pure white accent (#ffffff)', () => {
    const svgPath = path.join(scratchDir, 'test-white-accent.svg');
    const svgContent = `<svg width="400" height="400" viewBox="0 0 400 400" fill="none">
      <circle cx="200" cy="200" r="100" fill="#ffffff"/>
    </svg>`;
    fs.writeFileSync(svgPath, svgContent, 'utf8');

    try {
      const res = processLogo(svgPath, '#ffffff');
      expect(res.navbarLogo).toContain('fill="#ffffff"');
      expect(res.navbarLogo).toContain('data-l="100"');
    } finally {
      if (fs.existsSync(svgPath)) fs.unlinkSync(svgPath);
    }
  });

  test('multi-tone logo keeps a near-black detail distinct from the accent', () => {
    const svgPath = path.join(scratchDir, 'test-tone-logo.svg');
    const svgContent = `<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#8b5cf6"/>
      <text x="32" y="38" font-size="15" fill="#101010">MD</text>
    </svg>`;
    fs.writeFileSync(svgPath, svgContent, 'utf8');

    try {
      // Two tones: the mid shape keeps its relative lightness (66) while the
      // near-black detail is pushed to the far end (3). Snapping it onto the
      // accent instead would put it at 66 too and erase the detail.
      const res = processLogo(svgPath, '#895af6');
      expect(res.navbarLogo).toContain('fill="#895af6" data-l="66"');
      expect(res.navbarLogo).toContain('fill="#05010f" data-l="3"');
      expect(res.faviconTemplate).toContain('fill="{L_3}"');
    } finally {
      if (fs.existsSync(svgPath)) fs.unlinkSync(svgPath);
    }
  });

  test('processes custom raster image (PNG) as base64 data URI', () => {
    const pngPath = path.join(scratchDir, 'test-logo.png');
    // 1x1 transparent PNG buffer
    const pngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    fs.writeFileSync(pngPath, pngBuffer);

    try {
      const res = processLogo(pngPath, '#3b82f6');
      expect(res.navbarLogo).toContain('<img class="brand-logo" src="data:image/png;base64,');
      expect(res.navbarLogo).toContain('width="30" height="30"');
      expect(res.faviconHref).toContain('data:image/png;base64,');
    } finally {
      if (fs.existsSync(pngPath)) fs.unlinkSync(pngPath);
    }
  });
});

/**
 * Regression pins for ONE specific asset: showcase/assets/mdpp-logo.svg, the
 * placeholder logo the showcase ships (showcase.mdd sets `logo:`). It is a
 * two-tone knockout design -- a purple rounded square with "MD++" reversed out
 * of it -- and it shipped broken twice over, in two unrelated files:
 *
 *   1. The recolour rule flattened every extreme lightness onto the accent's
 *      own lightness, which is where the mid-tone shape had already landed, so
 *      rect and text collapsed to one hex (#895af6 on #895af6) and the text
 *      was invisible.
 *   2. The asset's own numbers put "MD++" at 72.25 units inside a 56-unit
 *      rect, spilling 8.12 units past the viewBox on each side.
 *
 * Every assertion here reads that one file off disk and checks its own
 * geometry. This is deliberately NOT a general "does text overflow its
 * container" check -- it must not start passing or failing for some other
 * asset, and it must not grow into one.
 */
describe('mdpp-logo.svg (the showcase placeholder logo)', () => {
  const ASSET = 'showcase/assets/mdpp-logo.svg';
  const ACCENT = '#895af6'; // the showcase accent
  const readAsset = (): string => fs.readFileSync(ASSET, 'utf8');

  test('the geometry these assertions are pinned to has not drifted', () => {
    const raw = readAsset();
    expect(raw).toContain('viewBox="0 0 64 64"');
    expect(/<rect[^>]*\sx="4"[^>]*\sy="4"[^>]*\swidth="56"/.test(raw)).toBe(true);
    expect(/<text[^>]*\sx="32"/.test(raw)).toBe(true);
    expect(/font-size="15\.5"/.test(raw)).toBe(true);
  });

  test('"MD++" fits inside this rect, not merely inside the viewBox', () => {
    const raw = readAsset();
    const size = Number(/font-size="([\d.]+)"/.exec(raw)![1]);
    const centreX = Number(/<text[^>]*\sx="([\d.]+)"/.exec(raw)![1]);
    const rectLeft = Number(/<rect[^>]*\sx="([\d.]+)"/.exec(raw)![1]);
    const rectRight = rectLeft + Number(/<rect[^>]*\swidth="([\d.]+)"/.exec(raw)![1]);

    const width = measureText('MD++', size, { bold: true });
    const left = centreX - width / 2;
    const right = centreX + width / 2;

    expect(left).toBeGreaterThanOrEqual(rectLeft);
    expect(right).toBeLessThanOrEqual(rectRight);
    // Pinned so a change to the advance table shows up in review rather than
    // quietly sliding the number. Was 72.25 at font-size 24.
    expect(Math.round(width * 100) / 100).toBe(46.66);
  });

  test('"MD++" sits on the rect\'s optical centre, not low in it', () => {
    const raw = readAsset();
    const size = Number(/font-size="([\d.]+)"/.exec(raw)![1]);
    const baseline = Number(/<text[^>]*\sy="([\d.]+)"/.exec(raw)![1]);
    const rectTop = Number(/<rect[^>]*\sy="([\d.]+)"/.exec(raw)![1]);
    const rectCentreY = rectTop + Number(/<rect[^>]*\sheight="([\d.]+)"/.exec(raw)![1]) / 2;

    // Caps straddle the baseline by roughly 0.72em in this stack, so their
    // optical centre is the baseline pulled up by half that. The asset shipped
    // with this sitting 2.4 units below the rect's centre.
    const capCentre = baseline - (0.72 * size) / 2;
    expect(Math.abs(capCentre - rectCentreY)).toBeLessThanOrEqual(1.5);
  });

  test('the knockout text is not recoloured onto the shape it sits on', () => {
    const { navbarLogo } = processLogo(ASSET, ACCENT);
    const rectFill = /<rect[^>]*\sfill="(#[0-9a-f]{6})"/i.exec(navbarLogo)![1];
    const textFill = /<text[^>]*\sfill="(#[0-9a-f]{6})"/i.exec(navbarLogo)![1];

    expect(rectFill).not.toBe(textFill);
    expect(rectFill).toBe('#895af6');
    expect(textFill).toBe('#f5f0fe');
  });

  test('both tones survive into the emitted data-l, which is what the runtime reads', () => {
    const { navbarLogo } = processLogo(ASSET, ACCENT);
    const tones = [...navbarLogo.matchAll(/data-l="(\d+)"/g)].map(m => Number(m[1]));

    expect(tones).toEqual([66, 97]);
    expect(new Set(tones).size).toBe(2);
    // The knockout must be emitted OUTSIDE the 15..85 window, otherwise a
    // runtime accent change drags it back onto the shape and the collision
    // that shipped simply reappears when the accent picker is touched.
    expect(tones.filter(l => l <= 15 || l >= 85)).toEqual([97]);
  });

  test('the compiler and the runtime agree on the thresholds', () => {
    // The two implementations are a matched pair; a constant changed in one and
    // not the other is the exact drift that would re-collide the tones.
    const ts = fs.readFileSync('src/renderer/logo.ts', 'utf8');
    expect(ts).toMatch(/const MID_LO = 15;/);
    expect(ts).toMatch(/const MID_HI = 85;/);
    expect(ts).toMatch(/const KNOCKOUT_L = 97;/);
    expect(ts).toMatch(/const SHADOW_L = 3;/);
  });

  test('the runtime rule is the JS we actually ship, and it is a fixed point', () => {
    const js = fs.readFileSync('templates/app/01-core.js', 'utf8');

    // Pin the thresholds so the two implementations cannot drift apart.
    expect(js).toMatch(/var LOGO_MID_LO = 15;/);
    expect(js).toMatch(/var LOGO_MID_HI = 85;/);
    expect(js).toMatch(/var LOGO_KNOCKOUT_L = 97;/);
    expect(js).toMatch(/var LOGO_SHADOW_L = 3;/);

    // Evaluate the shipped function itself rather than a reimplementation, so
    // editing logo.ts without editing the template is caught here.
    const consts = /var LOGO_MID_LO = 15;[\s\S]*?var LOGO_SHADOW_L = 3;/.exec(js)![0];
    const fnSrc = /function resolveLogoLightness\([\s\S]*?\n}/.exec(js)![0];
    const resolve = new Function(`${consts}\n${fnSrc}\nreturn resolveLogoLightness;`)() as (
      l: number,
      targetL: number,
      tones: number[],
    ) => number;

    // Fixed point: the {66, 97} the compiler emitted re-resolves to itself, so
    // recolouring at runtime cannot undo the compile-time decision.
    expect(resolve(66, 66, [66, 97])).toBe(66);
    expect(resolve(97, 66, [66, 97])).toBe(97);

    // Single-tone artwork keeps snapping wholesale to the accent, which is the
    // behaviour the four recolour tests above depend on.
    expect(resolve(100, 66, [100])).toBe(66);
    expect(resolve(50, 66, [50])).toBe(50);
    // A mid-tone never moves, whatever else is in the logo.
    expect(resolve(50, 66, [50, 97])).toBe(50);
  });
});
