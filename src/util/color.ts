/**
 * Color utility functions for hex manipulation.
 */

/** Normalize 3- or 6-digit hex (with optional #) to clean 6-character hex without #. */
export function normalizeHex(hex: string): string {
  let n = hex.replace('#', '');
  if (n.length === 3) {
    n = n.split('').map(c => c + c).join('');
  }
  return n;
}

/** Parse hex color to numeric RGB tuple [r, g, b]. */
export function hexToRgbValues(hex: string): [number, number, number] {
  const n = normalizeHex(hex);
  return [
    parseInt(n.slice(0, 2), 16),
    parseInt(n.slice(2, 4), 16),
    parseInt(n.slice(4, 6), 16),
  ];
}

/** Convert a 3- or 6-digit hex color to an "R,G,B" string. */
export function hexToRgb(hex: string): string {
  const [r, g, b] = hexToRgbValues(hex);
  return `${r},${g},${b}`;
}

/** Darken a hex color by mixing with 50% black. */
export function darkenHex(hex: string): string {
  const [r, g, b] = hexToRgbValues(hex);
  const dr = Math.round(r * 0.5);
  const dg = Math.round(g * 0.5);
  const db = Math.round(b * 0.5);
  return '#' + [dr, dg, db].map(c => c.toString(16).padStart(2, '0')).join('');
}

/** Compute contrasting text color (#ffffff vs #172033) for a given background hex. */
export function getContrastFg(hex: string): string {
  const [r, g, b] = hexToRgbValues(hex);
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  return y > 170 ? '#172033' : '#ffffff';
}

/** Linearly interpolate between two hex colors. */
export function lerpColor(hexA: string, hexB: string, t: number): string {
  const [r1, g1, b1] = hexToRgbValues(hexA);
  const [r2, g2, b2] = hexToRgbValues(hexB);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

const NAMED_COLORS: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  gray: '#808080',
  grey: '#808080',
  darkgray: '#a9a9a9',
  darkgrey: '#a9a9a9',
  lightgray: '#d3d3d3',
  lightgrey: '#d3d3d3',
  silver: '#c0c0c0',
  maroon: '#800000',
  olive: '#808000',
  navy: '#000080',
  purple: '#800080',
  teal: '#008080',
  orange: '#ffa500',
  gold: '#ffd700',
};

/** Convert any color string (hex, rgb, rgba, named color) to HSL [h, s, l]. */
export function parseAnyColor(colorStr: string): [number, number, number] | null {
  const clean = colorStr.trim().toLowerCase();
  if (clean === 'none' || clean === 'transparent') return null;

  if (NAMED_COLORS[clean]) {
    return hexToHsl(NAMED_COLORS[clean]);
  }

  if (clean.startsWith('rgb')) {
    const nums = clean.match(/\d+(?:\.\d+)?/g);
    if (nums && nums.length >= 3) {
      const r = Math.round(parseFloat(nums[0]));
      const g = Math.round(parseFloat(nums[1]));
      const b = Math.round(parseFloat(nums[2]));
      return rgbToHsl(r, g, b);
    }
  }

  if (clean.startsWith('hsl')) {
    const nums = clean.match(/\d+(?:\.\d+)?/g);
    if (nums && nums.length >= 3) {
      const h = Math.round(parseFloat(nums[0]));
      const s = Math.round(parseFloat(nums[1]));
      const l = Math.round(parseFloat(nums[2]));
      return [h, s, l];
    }
  }

  if (clean.startsWith('#')) {
    return hexToHsl(clean);
  }

  return null;
}

/** Validate that a string is a valid 3- or 6-digit hex color. */
export function isValidHex(color: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color);
}

/** Convert RGB [0..255] to HSL [h: 0..360, s: 0..100, l: 0..100]. */
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rNorm:
        h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0);
        break;
      case gNorm:
        h = (bNorm - rNorm) / d + 2;
        break;
      case bNorm:
        h = (rNorm - gNorm) / d + 4;
        break;
    }
    h /= 6;
  }

  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

/** Convert HSL [h: 0..360, s: 0..100, l: 0..100] to RGB [r: 0..255, g: 0..255, b: 0..255]. */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hNorm = h / 360;
  const sNorm = s / 100;
  const lNorm = l / 100;

  let r: number, g: number, b: number;

  if (sNorm === 0) {
    r = g = b = lNorm;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = lNorm < 0.5 ? lNorm * (1 + sNorm) : lNorm + sNorm - lNorm * sNorm;
    const p = 2 * lNorm - q;
    r = hue2rgb(p, q, hNorm + 1 / 3);
    g = hue2rgb(p, q, hNorm);
    b = hue2rgb(p, q, hNorm - 1 / 3);
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/** Convert hex color to HSL [h, s, l]. */
export function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgbValues(hex);
  return rgbToHsl(r, g, b);
}

/** Convert HSL [h, s, l] to 6-digit hex color. */
export function hslToHex(h: number, s: number, l: number): string {
  const [r, g, b] = hslToRgb(h, s, l);
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

/**
 * Transforms a source color (hex, rgb) to have the target accent's Hue and Saturation,
 * while preserving the source color's perceived Lightness.
 */
export function recolorToAccent(sourceHex: string, targetAccentHex: string): string {
  const [, , sourceL] = hexToHsl(sourceHex);
  const [targetH, targetS] = hexToHsl(targetAccentHex);
  return hslToHex(targetH, targetS, sourceL);
}
