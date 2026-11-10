import { htmlDecode } from './escape.js';

/**
 * Parse TITLE: directive from raw diagram/table source.
 * Returns { title, body } where body has the TITLE: line removed.
 */
export function parseTitleDirective(source: string): { title: string; body: string } {
  const lines = source.split(/\r?\n/);
  let title = '';
  let titleLineIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('%%')) continue;
    if (trimmed.toUpperCase().startsWith('TITLE:')) {
      title = trimmed.slice(6).trim();
      titleLineIdx = i;
      break;
    }
    break;
  }

  if (titleLineIdx >= 0) {
    const remainingLines = [...lines.slice(0, titleLineIdx), ...lines.slice(titleLineIdx + 1)];
    return {
      title,
      body: remainingLines.join('\n'),
    };
  }

  return { title: '', body: source };
}

/** Extract a `data-*` attribute value from a raw HTML attribute string (raw encoded form). */
export function extractDataAttr(attrs: string, name: string): string {
  const m = attrs.match(new RegExp(`data-${name}="([^"]*)"`));
  return m ? m[1] : '';
}

/** Extract a `data-*` attribute value from a raw HTML attribute string and decode HTML entities. */
export function extractDecodedDataAttr(attrs: string, name: string): string {
  const raw = extractDataAttr(attrs, name);
  return raw ? htmlDecode(raw) : '';
}

/** Create a RegExp matching a code-wrap block for a given kind. */
export function createCodeWrapRegex(kind: string): RegExp {
  return new RegExp(
    `<div class="code-wrap ${kind}"([^>]*)>\\s*<pre><code class="language-${kind}"[^>]*>([\\s\\S]*?)<\\/code><\\/pre>\\s*<div class="${kind}-render"><\\/div>\\s*<\\/div>`,
    'g'
  );
}
