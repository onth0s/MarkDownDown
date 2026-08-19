/**
 * Color utility functions for hex manipulation.
 */

/** Convert a 3- or 6-digit hex color to an "R,G,B" string. */
export function hexToRgb(hex: string): string {
  let n = hex.replace('#', '');
  if (n.length === 3) {
    n = n.split('').map(c => c + c).join('');
  }
  return `${parseInt(n.slice(0, 2), 16)},${parseInt(n.slice(2, 4), 16)},${parseInt(n.slice(4, 6), 16)}`;
}

/** Darken a hex color by mixing with 50% black. */
export function darkenHex(hex: string): string {
  let n = hex.replace('#', '');
  if (n.length === 3) {
    n = n.split('').map(c => c + c).join('');
  }
  const v = parseInt(n, 16);
  const r = Math.round(((v >> 16) & 255) * 0.5);
  const g = Math.round(((v >> 8) & 255) * 0.5);
  const b = Math.round((v & 255) * 0.5);
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

/** Validate that a string is a valid 3- or 6-digit hex color. */
export function isValidHex(color: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color);
}
