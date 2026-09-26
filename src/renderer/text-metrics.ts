/**
 * Calibrated text metrics for server-side SVG layout.
 *
 * The renderer emits SVG at compile time, with no access to a font file or a
 * layout engine, so node boxes and wrap points must be derived from a static
 * model of the font stack declared in `templates/style.css`:
 *
 *   Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
 *   "Segoe UI", sans-serif
 *
 * A flat "pixels per character" constant cannot work for a proportional face:
 * it over-measures lowercase prose by 30-55% (blowing node boxes out to ~2x and
 * wrapping far too early) while under-measuring runs of wide glyphs such as
 * ALL-CAPS titles, `M`/`W` and em-dashes. That under-estimate is what allowed
 * text to be laid out wider than the box that was sized to hold it.
 *
 * ADVANCE_EM below holds per-glyph advance widths in em units, taken from the
 * Inter metrics with the neighbouring system faces in mind. Ranges not listed
 * fall back through CLASS_EM and finally to a full-em box, which is the right
 * answer for CJK and for any glyph we have not measured.
 */

/** Bias every measurement slightly wide. Under-estimating causes visible
 *  overflow and viewBox clipping; over-estimating only costs a little air. */
const SAFETY = 1.03;

/** Inter regular advance widths, in em units, indexed by code unit. */
const ADVANCE_EM: Record<string, number> = {
  ' ': 0.281, '!': 0.295, '"': 0.4, '#': 0.72, '$': 0.6, '%': 0.87, '&': 0.72,
  "'": 0.22, '(': 0.34, ')': 0.34, '*': 0.42, '+': 0.6, ',': 0.26, '-': 0.36,
  '.': 0.26, '/': 0.4,
  '0': 0.64, '1': 0.4, '2': 0.6, '3': 0.6, '4': 0.6, '5': 0.6, '6': 0.6, '7': 0.58,
  '8': 0.62, '9': 0.62,
  ':': 0.26, ';': 0.26, '<': 0.6, '=': 0.6, '>': 0.6, '?': 0.5, '@': 0.95,
  'A': 0.68, 'B': 0.65, 'C': 0.68, 'D': 0.71, 'E': 0.58, 'F': 0.56, 'G': 0.73,
  'H': 0.73, 'I': 0.29, 'J': 0.3, 'K': 0.65, 'L': 0.55, 'M': 0.92, 'N': 0.74,
  'O': 0.79, 'P': 0.63, 'Q': 0.79, 'R': 0.64, 'S': 0.6, 'T': 0.6, 'U': 0.72,
  'V': 0.66, 'W': 0.96, 'X': 0.64, 'Y': 0.61, 'Z': 0.6,
  '[': 0.32, '\\': 0.4, ']': 0.32, '^': 0.5, '_': 0.5, '`': 0.4,
  'a': 0.57, 'b': 0.6, 'c': 0.53, 'd': 0.6, 'e': 0.56, 'f': 0.35, 'g': 0.6,
  'h': 0.59, 'i': 0.25, 'j': 0.27, 'k': 0.55, 'l': 0.25, 'm': 0.9, 'n': 0.59,
  'o': 0.59, 'p': 0.6, 'q': 0.6, 'r': 0.39, 's': 0.5, 't': 0.36, 'u': 0.59,
  'v': 0.53, 'w': 0.79, 'x': 0.53, 'y': 0.53, 'z': 0.5,
  '{': 0.34, '|': 0.28, '}': 0.34, '~': 0.6,
};

/** Punctuation and symbols that are common in this DSL and not in the table. */
const SYMBOL_EM: Record<string, number> = {
  '\u00a0': 0.281, // nbsp
  '\u2013': 0.6, // en dash
  '\u2014': 1.0, // em dash - the title/subtitle separator
  '\u2018': 0.22, '\u2019': 0.22, // ' '
  '\u201c': 0.35, '\u201d': 0.35, // " "
  '\u2026': 1.0, // ...
  '\u2192': 1.0, // ->
  '\u00d7': 0.6, // multiplication sign
  '\u2264': 0.72, '\u2265': 0.72, // <= >=
  '\u2022': 0.5, // bullet
  '\u00b7': 0.31, // middle dot
  '\u00a9': 0.76, // (c)
  '\u2032': 0.22, '\u2033': 0.4, // primes
};

/** Em width used for any glyph with no measured advance (CJK, emoji, ...). */
const FULL_EM = 1.0;

/** Inter Bold runs a little wider than Regular; the effect is strongest on
 *  lowercase and near-zero on the already-wide capitals. */
const BOLD_SCALE_LOWER = 1.075;
const BOLD_SCALE_UPPER = 1.02;
const BOLD_SCALE_OTHER = 1.05;

/** Advance width of the monospace stack used for `code` spans. */
const MONO_EM = 0.6;

function isUpper(ch: string): boolean {
  return ch >= 'A' && ch <= 'Z';
}

function isLower(ch: string): boolean {
  return ch >= 'a' && ch <= 'z';
}

function glyphEm(ch: string): number {
  const direct = ADVANCE_EM[ch];
  if (direct !== undefined) return direct;
  const symbol = SYMBOL_EM[ch];
  if (symbol !== undefined) return symbol;
  return FULL_EM;
}

import { parseInlineMarkdown } from './inline-markdown.js';

export interface MeasureOptions {
  /** Render at weight 700. */
  bold?: boolean;
  /** Italic does not change Inter's advances, but is accepted for completeness. */
  italic?: boolean;
  /** Measure against the monospace stack (used for `code` spans). */
  mono?: boolean;
  /** Skip the SAFETY bias. Intended for tests and for internal comparisons. */
  exact?: boolean;
}

function runWidth(text: string, size: number, bold: boolean, mono: boolean): number {
  let em = 0;
  for (const ch of text) {
    if (mono) {
      em += MONO_EM;
      continue;
    }
    const g = glyphEm(ch);
    if (bold) {
      if (isLower(ch)) em += g * BOLD_SCALE_LOWER;
      else if (isUpper(ch)) em += g * BOLD_SCALE_UPPER;
      else em += g * BOLD_SCALE_OTHER;
    } else {
      em += g;
    }
  }
  return em * size;
}

/**
 * Advance width of a plain string, in SVG user units.
 * `bold` may be tri-state: `undefined` means "inherit", which callers use when
 * measuring text that will be emitted inside an already-bold parent.
 */
export function measureText(text: string, size: number, opts: MeasureOptions = {}): number {
  if (!text) return 0;
  const raw = runWidth(text, size, !!opts.bold, !!opts.mono);
  return opts.exact ? raw : raw * SAFETY;
}

/** Split `text` into maximal runs that share a rendering style. */
interface StyledRun {
  text: string;
  bold: boolean;
  italic: boolean;
  mono: boolean;
}

/**
 * Measure a string that may contain inline Markdown (`**bold**`, `*italic*`,
 * `` `code` ``, `~~strike~~`), charging each span at its own weight and family.
 *
 * The previous implementation stripped the delimiters and measured the whole
 * line at the parent's weight, so a bold or monospace span inside a subtitle
 * was always under-measured and overflowed its box.
 */
export function measureInline(text: string, size: number, opts: MeasureOptions = {}): number {
  if (!text) return 0;
  const parentBold = !!opts.bold;
  const runs = styledRuns(text, parentBold, !!opts.italic);
  let total = 0;
  for (const run of runs) {
    total += runWidth(run.text, size, run.bold, run.mono);
  }
  return opts.exact ? total : total * SAFETY;
}

/** Build the styled runs for a line, resolving nested inline Markdown. */
function styledRuns(text: string, parentBold: boolean, parentItalic: boolean): StyledRun[] {
  const spans = parseInlineMarkdown(text);
  if (!spans.length) return [];
  return spans.map(span => ({
    text: span.text,
    bold: !!(span.bold || span.code) || parentBold,
    italic: !!(span.italic || parentItalic),
    mono: !!span.code,
  }));
}

/**
 * Word-wrap `text` so that every produced line measures no wider than `maxW`.
 *
 * Words longer than `maxW` are hard-broken at character granularity. This is
 * what makes the `MAX_W` node clamp safe: previously an over-long single token
 * was returned verbatim, the measured width was then clamped away, and the
 * resulting text was drawn wider than its own node and clipped by the viewBox.
 */
export function wrapToWidth(text: string, size: number, maxW: number, opts: MeasureOptions = {}): string[] {
  const source = String(text ?? '').trim();
  if (!source) return [];
  const limit = Math.max(1, maxW);

  const words = source.split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const lines: string[] = [];
  let current = '';

  const flush = (): void => {
    if (current) lines.push(current);
    current = '';
  };

  for (const word of words) {
    if (measureInline(word, size, opts) <= limit) {
      const candidate = current ? `${current} ${word}` : word;
      if (!current || measureInline(candidate, size, opts) <= limit) {
        current = candidate;
        continue;
      }
      flush();
      current = word;
      continue;
    }

    // Over-long token: hard-break it so no line can exceed the limit.
    flush();
    let chunk = '';
    for (const ch of word) {
      const candidate = chunk + ch;
      if (chunk && measureInline(candidate, size, opts) > limit) {
        lines.push(chunk);
        chunk = ch;
      } else {
        chunk = candidate;
      }
    }
    current = chunk;
  }
  flush();

  return lines.length ? lines : [source];
}

/** Widest line of an already-wrapped block, in SVG user units. */
export function widestLine(lines: string[], size: number, opts: MeasureOptions = {}): number {
  let max = 0;
  for (const line of lines) {
    const w = measureInline(line, size, opts);
    if (w > max) max = w;
  }
  return max;
}
