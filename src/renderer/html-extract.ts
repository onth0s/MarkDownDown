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
/** Strip chrome that is not source body: hero, SVG, fences, controls, mirror UI. */
function stripChrome(html: string): string {
  const start = html.indexOf('<article');
  const end = html.indexOf('</article>');
  if (start < 0 || end < 0) return '';
  return html
    .slice(start, end + 10)
    .replace(/<section class="hero">[\s\S]*?<\/section>/g, '')
    .replace(/<svg[\s\S]*?<\/svg>/g, '')
    .replace(/<pre>[\s\S]*?<\/pre>/g, '')
    .replace(/<aside class="mirror-block"[\s\S]*?<\/aside>/g, '')
    .replace(/<div class="alert-title">[\s\S]*?<\/div>/g, '')
    .replace(/<div class="code-title-bar">[\s\S]*?<\/div>/g, '')
    .replace(/<div class="code-actions">[\s\S]*?<\/div>/g, '')
    .replace(/<div class="no-results"[^>]*>[\s\S]*?<\/div>/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<textarea[\s\S]*?<\/textarea>/g, '')
    .replace(/<button[\s\S]*?<\/button>/g, '')
    .replace(/<\/?wbr[^>]*>/g, '');
}

/** Decode the HTML entities the compiler emits. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

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