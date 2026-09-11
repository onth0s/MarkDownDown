/** Escape HTML special characters for safe text content. */
export function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}


const ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

const ENTITY_RE = /&(amp|lt|gt|quot|apos|#(\d+)|#x([0-9a-fA-F]+));/g;

/** Decode common HTML entities back to characters. */
export function htmlDecode(s: string): string {
  if (!s || !s.includes('&')) return s;
  return s.replace(
    ENTITY_RE,
    (_, entity: string, dec: string | undefined, hex: string | undefined) => {
      if (ENTITY_MAP[entity]) return ENTITY_MAP[entity];
      if (dec !== undefined) return String.fromCharCode(Number(dec));
      if (hex !== undefined) return String.fromCharCode(parseInt(hex, 16));
      return _;
    },
  );
}
