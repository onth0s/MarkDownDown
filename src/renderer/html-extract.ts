import { htmlDecode } from '../util/escape.js';
/**
 * Reads prose runs back out of rendered HTML, in the order the skeleton emitted
 * its PROSE placeholders.
 *
 * This runs in Node (for `mdd --check`) against an HTML string. The browser
 * build performs the same walk over the live DOM.
 *
 * Extraction is FLAT: after stripping chrome, we take every text node in
 * document order (`>text<` chunks). The skeleton's PROSE slots and these runs
 * must line up one-to-one; see skeleton-build.ts for the alignment contract.
 * The two mutable knobs here are what counts as chrome, and the treatment of
 * whitespace-only nodes:
 *
 *   - `<wbr>` is removed FIRST so a "word/word" split re-merges into one run.
 *   - A whitespace-only text node directly after a `<br>` is the break tag's
 *     newline (hardbreak / alert line breaks) and is dropped — it has no slot.
 *   - Any other whitespace-only node is kept: it is either a real space run
 *     (e.g. the text between `</em>` and `<strong>`) or a softbreak's newline
 *     between two inline elements, both of which DO have slots.
 */
/** Strip balanced occurrences of a specific tag matching `openRe` (handles nested same-name tags). */
function stripBalancedElement(html: string, openRe: RegExp, tagName: string): string {
  const closeTag = `</${tagName}>`;
  const tagRe = new RegExp(`<(\\/)?${tagName}\\b[^>]*>`, 'gi');
  let out = '';
  let last = 0;
  openRe.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(html)) !== null) {
    if (m.index < last) continue;
    out += html.slice(last, m.index);
    tagRe.lastIndex = m.index;
    let depth = 0;
    let endIdx = -1;
    let tm: RegExpExecArray | null;
    while ((tm = tagRe.exec(html)) !== null) {
      if (tm[1]) {
        depth--;
        if (depth === 0) {
          endIdx = tm.index + tm[0].length;
          break;
        }
      } else {
        depth++;
      }
    }
    if (endIdx === -1) {
      last = m.index + m[0].length;
    } else {
      last = endIdx;
      openRe.lastIndex = endIdx;
    }
  }
  void closeTag;
  return out + html.slice(last);
}

/** Strip chrome that is not source body: hero, SVG, fences, controls, mirror UI. */
function stripChrome(html: string): string {
  const start = html.indexOf('<article');
  const end = html.lastIndexOf('</article>');
  if (start < 0 || end < 0) return '';
  let body = html.slice(start, end + 10);
  body = stripBalancedElement(body, /<section\s+class="hero">/gi, 'section');
  body = stripBalancedElement(body, /<svg\b[^>]*>/gi, 'svg');
  body = stripBalancedElement(body, /<pre\b[^>]*>/gi, 'pre');
  body = stripBalancedElement(body, /<aside\s+class="mirror-block"[^>]*>/gi, 'aside');
  body = stripBalancedElement(body, /<div\s+class="alert-title">/gi, 'div');
  body = stripBalancedElement(body, /<div\s+class="code-title-bar">/gi, 'div');
  body = stripBalancedElement(body, /<div\s+class="code-actions">/gi, 'div');
  body = stripBalancedElement(body, /<div\s+class="no-results"[^>]*>/gi, 'div');
  body = stripBalancedElement(body, /<script\b[^>]*>/gi, 'script');
  body = stripBalancedElement(body, /<style\b[^>]*>/gi, 'style');
  body = stripBalancedElement(body, /<textarea\b[^>]*>/gi, 'textarea');
  body = stripBalancedElement(body, /<button\b[^>]*>/gi, 'button');
  return body.replace(/<\/?wbr[^>]*>/g, '');
}

/** Decode the HTML entities the compiler emits. */
export const decodeEntities = htmlDecode;

/**
 * Extract the prose runs from the document `<article>` element, in order.
 * Returns an empty list when no article element is present.
 */
export function extractProse(html: string): string[] {
  const stripped = stripChrome(html);
  if (stripped === '') return [];

  const runs: string[] = [];
  const re = new RegExp('<(?:/?)([a-zA-Z][a-zA-Z0-9-]*)[^>]*>|[^<]+', 'g');
  let m: RegExpExecArray | null;
  let afterBr = false;
  while ((m = re.exec(stripped))) {
    const chunk = m[0];
    if (chunk[0] === '<') {
      afterBr = m[1].toLowerCase() === 'br';
      continue;
    }
    const text = decodeEntities(chunk);
    if (afterBr && text.trim() === '') {
      afterBr = false;
      continue;
    }
    afterBr = false;
    runs.push(text);
  }
  return runs;
}

/**
 * Read every `data-raw` fence payload, in document order.
 * These are the byte-identical DSL/fence sources (diagram, table, mirror,
 * plain) that the skeleton stores verbatim.
 */
export function extractFences(html: string): string[] {
  const fences: string[] = [];
  const re = /data-raw="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    fences.push(decodeEntities(m[1]));
  }
  return fences;
}