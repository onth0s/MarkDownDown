/**
 * SVG rendering primitives shared across diagram and table renderers.
 */

/** Round a number to 1 decimal place. */
export function round1(v: number): string {
  return String(Math.round(v * 10) / 10);
}

/** Format an SVG coordinate pair: "x y" (rounded to 1dp). */
export function coordPair(x: number, y: number): string {
  return `${round1(x)} ${round1(y)}`;
}

/** Format SVG x/y attributes: x="..." y="..." */
export function xyAttrs(x: number, y: number): string {
  return `x="${round1(x)}" y="${round1(y)}"`;
}

/** Approximate text width in SVG units based on font size and weight. */
export function textWidth(text: string, size: number, bold: boolean): number {
  const base = size <= 11 ? 7.8 : size <= 12 ? 8.6 : 9.6;
  const boldExtra = bold ? 0.8 : 0;
  return text.length * (base + boldExtra);
}

/** Word-wrap text to fit within maxW SVG units. */
export function wrapText(text: string, size: number, bold: boolean, maxW: number): string[] {
  const words = String(text).split(/\s+/).filter(Boolean);
  if (words.length <= 1) return words.length ? [words[0]] : [];
  const lines: string[] = [];
  let cur = words[0];
  for (let i = 1; i < words.length; i++) {
    const cand = cur + ' ' + words[i];
    if (textWidth(cand, size, bold) > maxW) {
      lines.push(cur);
      cur = words[i];
    } else {
      cur = cand;
    }
  }
  lines.push(cur);
  return lines;
}

/** Build an SVG <marker> definition for arrowheads. */
export function buildArrowMarker(id: string): string {
  return `<defs><marker id="${id}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,1 L8,5 L0,9 z" fill="var(--accent)" stroke="var(--accent)" stroke-linejoin="round"/></marker></defs>`;
}
