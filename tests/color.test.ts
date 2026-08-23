import {
  normalizeHex,
  formatHexWithHash,
  hexToRgbValues,
  hexToRgb,
  darkenHex,
  getContrastFg,
  lerpColor,
  isValidHex,
  parseAnyColor,
  rgbToHsl,
  hslToRgb,
  hexToHsl,
  hslToHex,
  recolorToAccent,
} from '../src/util/color.js';

describe('color utilities', () => {
  test('normalizeHex expands 3-digit and strips #', () => {
    expect(normalizeHex('#fff')).toBe('ffffff');
    expect(normalizeHex('fff')).toBe('ffffff');
    expect(normalizeHex('FFF')).toBe('ffffff');
    expect(normalizeHex('000')).toBe('000000');
    expect(normalizeHex('#3b82f6')).toBe('3b82f6');
  });

  test('formatHexWithHash normalizes to #rrggbb', () => {
    expect(formatHexWithHash('fff')).toBe('#ffffff');
    expect(formatHexWithHash('FFF')).toBe('#ffffff');
    expect(formatHexWithHash('000')).toBe('#000000');
    expect(formatHexWithHash('#000')).toBe('#000000');
    expect(formatHexWithHash('#3b82f6')).toBe('#3b82f6');
  });

  test('hexToRgbValues parses 3- and 6-digit hex to numbers', () => {
    expect(hexToRgbValues('#ff0000')).toEqual([255, 0, 0]);
    expect(hexToRgbValues('#00f')).toEqual([0, 0, 255]);
    expect(hexToRgbValues('fff')).toEqual([255, 255, 255]);
  });

  test('hexToRgb returns R,G,B string', () => {
    expect(hexToRgb('#3b82f6')).toBe('59,130,246');
    expect(hexToRgb('#000')).toBe('0,0,0');
    expect(hexToRgb('FFF')).toBe('255,255,255');
  });

  test('darkenHex darkens color by 50%', () => {
    expect(darkenHex('#ffffff')).toBe('#808080');
    expect(darkenHex('#000000')).toBe('#000000');
  });

  test('getContrastFg chooses white for dark bg and dark for light bg', () => {
    expect(getContrastFg('#000000')).toBe('#ffffff');
    expect(getContrastFg('000')).toBe('#ffffff');
    expect(getContrastFg('#ffffff')).toBe('#172033');
    expect(getContrastFg('FFF')).toBe('#172033');
    expect(getContrastFg('#ffff00')).toBe('#172033');
  });

  test('lerpColor interpolates between two colors', () => {
    expect(lerpColor('#000000', '#ffffff', 0)).toBe('#000000');
    expect(lerpColor('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(lerpColor('#000000', '#ffffff', 0.5)).toBe('#808080');
  });

  test('isValidHex validates 3- and 6-digit hex format with or without #', () => {
    expect(isValidHex('#fff')).toBe(true);
    expect(isValidHex('fff')).toBe(true);
    expect(isValidHex('FFF')).toBe(true);
    expect(isValidHex('000')).toBe(true);
    expect(isValidHex('#3b82f6')).toBe(true);
    expect(isValidHex('3b82f6')).toBe(true);
    expect(isValidHex('#gggggg')).toBe(false);
    expect(isValidHex('#12')).toBe(false);
  });

  test('parseAnyColor handles hex, rgb, hsl, named colors, and none', () => {
    expect(parseAnyColor('none')).toBeNull();
    expect(parseAnyColor('transparent')).toBeNull();
    expect(parseAnyColor('red')).toEqual([0, 100, 50]);
    expect(parseAnyColor('#ff0000')).toEqual([0, 100, 50]);
    expect(parseAnyColor('rgb(255, 0, 0)')).toEqual([0, 100, 50]);
    expect(parseAnyColor('hsl(120, 100%, 50%)')).toEqual([120, 100, 50]);
    expect(parseAnyColor('invalid-color-str')).toBeNull();
  });

  test('rgbToHsl and hslToRgb round-trip correctly', () => {
    const [h, s, l] = rgbToHsl(255, 0, 0);
    expect(h).toBe(0);
    expect(s).toBe(100);
    expect(l).toBe(50);
    const [r, g, b] = hslToRgb(h, s, l);
    expect(r).toBe(255);
    expect(g).toBe(0);
    expect(b).toBe(0);
  });

  test('hexToHsl and hslToHex conversion', () => {
    const hsl = hexToHsl('#3b82f6');
    const hex = hslToHex(hsl[0], hsl[1], hsl[2]);
    expect(isValidHex(hex)).toBe(true);
  });

  test('recolorToAccent preserves lightness while adopting target hue and saturation', () => {
    const recolored = recolorToAccent('#ff0000', '#3b82f6');
    expect(isValidHex(recolored)).toBe(true);
    const [h, s, l] = hexToHsl(recolored);
    const [targetH, targetS] = hexToHsl('#3b82f6');
    expect(h).toBe(targetH);
    expect(s).toBe(targetS);
    expect(l).toBe(50);
  });
});
