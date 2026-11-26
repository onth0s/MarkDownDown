/** Escape HTML special characters for safe text content and attributes. */
export function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Serialize JSON for safe embedding inside an HTML <script> tag. */
export function safeJsonForScript(val: unknown): string {
  return JSON.stringify(val).replace(/</g, '\\u003c');
}

const SAFE_SCHEMES_RE = /^(?:https?|mailto|file|vscode):/i;
const SAFE_DATA_IMAGE_RE = /^data:image\/(?:png|jpeg|gif|webp);base64,/i;

function stripControlChars(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code >= 0x20 && code !== 0x7f) out += s[i];
  }
  return out;
}

/** Allowlist check for link/image URLs (blocks javascript:, vbscript:, data:text/html, control-char smuggling). */
export function isSafeUrl(url: string): boolean {
  const clean = stripControlChars(url).trim();
  if (!clean) return false;
  if (SAFE_SCHEMES_RE.test(clean) || SAFE_DATA_IMAGE_RE.test(clean)) return true;
  const colonIdx = clean.indexOf(':');
  if (colonIdx === -1) return true;
  return /[/?#]/.test(clean.slice(0, colonIdx));
}

const ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

const ENTITY_RE = /&(amp|lt|gt|quot|apos|#(\d+)|#[xX]([0-9a-fA-F]+));/g;

/** Decode common HTML entities back to characters. */
export function htmlDecode(s: string): string {
  if (!s || !s.includes('&')) return s;
  return s.replace(
    ENTITY_RE,
    (_, entity: string, dec: string | undefined, hex: string | undefined) => {
      if (ENTITY_MAP[entity]) return ENTITY_MAP[entity];
      try {
        if (dec !== undefined) return String.fromCodePoint(Number(dec));
        if (hex !== undefined) return String.fromCodePoint(parseInt(hex, 16));
      } catch {
        return _;
      }
      return _;
    },
  );
}
