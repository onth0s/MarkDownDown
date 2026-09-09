/**
 * Lightweight inline Markdown parser for SVG text rendering.
 * Supports bold (**text** or __text__), italic (*text* or _text_),
 * inline code (`text`), and strikethrough (~~text~~), including combinations
 * like **`code`** or *`code`*.
 */
import { escHtml } from '../util/escape.js';

export interface FormattedSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  strike?: boolean;
}

/**
 * Tokenize a plain string with inline Markdown into an array of FormattedSpans.
 */
export function parseInlineMarkdown(input: string): FormattedSpan[] {
  if (!input) return [];

  // Match inline markdown tokens:
  // 1. Code: `code`
  // 2. Bold + Italic: ***text*** or ___text___
  // 3. Bold: **text** or __text__
  // 4. Italic: *text* or _text_
  // 5. Strikethrough: ~~text~~
  // Delimiters can also enclose backtick code, e.g. **`Alt+1`**
  const TOKEN_RE = /(`[^`]+`|\*\*\*[^*]+\*\*\*|___[^_]+___|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*]+\*|_[^_]+_)/g;

  const spans: FormattedSpan[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = TOKEN_RE.exec(input)) !== null) {
    if (match.index > lastIdx) {
      spans.push({ text: input.slice(lastIdx, match.index) });
    }

    const raw = match[0];
    if (raw.startsWith('`') && raw.endsWith('`')) {
      spans.push({ text: raw.slice(1, -1), code: true });
    } else if (raw.startsWith('***') && raw.endsWith('***')) {
      const inner = raw.slice(3, -3);
      const innerSpans = parseInlineMarkdown(inner);
      for (const s of innerSpans) {
        spans.push({ ...s, bold: true, italic: true });
      }
    } else if (raw.startsWith('___') && raw.endsWith('___')) {
      const inner = raw.slice(3, -3);
      const innerSpans = parseInlineMarkdown(inner);
      for (const s of innerSpans) {
        spans.push({ ...s, bold: true, italic: true });
      }
    } else if ((raw.startsWith('**') && raw.endsWith('**')) || (raw.startsWith('__') && raw.endsWith('__'))) {
      const inner = raw.slice(2, -2);
      const innerSpans = parseInlineMarkdown(inner);
      for (const s of innerSpans) {
        spans.push({ ...s, bold: true });
      }
    } else if (raw.startsWith('~~') && raw.endsWith('~~')) {
      const inner = raw.slice(2, -2);
      const innerSpans = parseInlineMarkdown(inner);
      for (const s of innerSpans) {
        spans.push({ ...s, strike: true });
      }
    } else if ((raw.startsWith('*') && raw.endsWith('*')) || (raw.startsWith('_') && raw.endsWith('_'))) {
      const inner = raw.slice(1, -1);
      const innerSpans = parseInlineMarkdown(inner);
      for (const s of innerSpans) {
        spans.push({ ...s, italic: true });
      }
    } else {
      spans.push({ text: raw });
    }

    lastIdx = match.index + raw.length;
  }

  if (lastIdx < input.length) {
    spans.push({ text: input.slice(lastIdx) });
  }

  return spans;
}

/**
 * Strip all markdown formatting characters from a string, yielding the plain visible text.
 */
export function stripMarkdown(input: string): string {
  if (!input) return '';
  const spans = parseInlineMarkdown(input);
  return spans.map(s => s.text).join('');
}

/**
 * Approximate text width for a formatted string in SVG units.
 */
export function measureFormattedWidth(
  input: string,
  charWidthNormal: number,
  charWidthBold: number,
  defaultBold = false
): number {
  const spans = parseInlineMarkdown(input);
  if (!spans.length) return 0;

  let total = 0;
  for (const span of spans) {
    const isBold = span.bold || defaultBold;
    const rate = isBold ? charWidthBold : charWidthNormal;
    total += span.text.length * rate;
  }
  return total;
}

/**
 * Render formatted spans to SVG <tspan> elements.
 * If there is no formatting, returns escaped plain text.
 */
export function renderFormattedTspans(
  input: string,
  options: {
    codeClass?: string;
    strikeClass?: string;
    parentBold?: boolean;
    parentItalic?: boolean;
  } = {}
): string {
  const spans = parseInlineMarkdown(input);
  const hasFormatting = spans.some(s => s.bold || s.italic || s.code || s.strike);

  if (!hasFormatting) {
    return escHtml(input);
  }

  return spans.map(s => {
    const attrs: string[] = [];
    const classes: string[] = [];

    if (s.code) {
      if (options.codeClass) classes.push(options.codeClass);
      attrs.push('font-family="monospace"');
    }
    if (s.bold && !options.parentBold) {
      attrs.push('font-weight="700"');
    }
    if (s.italic && !options.parentItalic) {
      attrs.push('font-style="italic"');
    }
    if (s.strike) {
      if (options.strikeClass) classes.push(options.strikeClass);
      attrs.push('text-decoration="line-through"');
    }

    if (classes.length) {
      attrs.unshift(`class="${classes.join(' ')}"`);
    }

    const content = escHtml(s.text);
    if (attrs.length > 0) {
      return `<tspan ${attrs.join(' ')}>${content}</tspan>`;
    }
    return content;
  }).join('');
}
