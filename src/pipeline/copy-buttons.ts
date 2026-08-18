/**
 * Wrap code blocks with copy-to-clipboard buttons.
 *
 * Protocol (3 chained regex passes):
 * 1. Fenced diagram/table blocks already have a .code-wrap parent —
 *    insert the copy button right after the opening div.
 * 2. Plain <pre><code blocks (standard fenced code) don't have a wrapper —
 *    create a .code-wrap div around them with the button inside.
 * 3. Close the newly created .code-wrap div after </code></pre> when it
 *    isn't already followed by a diagram/table render div.
 */
const COPY_BTN_FENCED_RE = /(<div class="code-wrap (?:diagram|table)"[^>]*>)(<pre><code)/g;
const COPY_BTN_OPEN_PRE_RE = /(?<!>)<pre><code/g;
const COPY_BTN_CLOSE_PRE_RE = /(?<!<\/div>)<\/code><\/pre>(?!\s*<div)/g;

export function wrapCodeBlocksWithCopyButtons(html: string): string {
  COPY_BTN_FENCED_RE.lastIndex = 0;
  let result = html.replace(
    COPY_BTN_FENCED_RE,
    '$1<button class="copy-btn" type="button">Copy</button>$2'
  );
  result = result.replace(
    COPY_BTN_OPEN_PRE_RE,
    '<div class="code-wrap"><button class="copy-btn" type="button">Copy</button><pre><code'
  );
  result = result.replace(
    COPY_BTN_CLOSE_PRE_RE,
    '</code></pre></div>'
  );
  return result;
}
