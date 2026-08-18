/**
 * Wrap code blocks with copy-to-clipboard buttons without nesting or unclosed tags.
 *
 * 1. Fenced diagram/table blocks already have an outer .code-wrap parent —
 *    insert the copy button right after the opening div tag.
 * 2. Plain <pre><code blocks (standard fenced code) don't have a wrapper —
 *    wrap the entire <pre><code...</code></pre> block in a .code-wrap div with the copy button inside.
 * 3. Validate that no .code-wrap divs are nested within each other; throw an error if detected.
 */
const CODE_BLOCK_OR_WRAPPER_RE = /(<div\s+class="code-wrap\b[^"]*"[^>]*>)([\s\S]*?<\/div>)|(<pre><code[\s\S]*?<\/code><\/pre>)/g;

export function wrapCodeBlocksWithCopyButtons(html: string): string {
  CODE_BLOCK_OR_WRAPPER_RE.lastIndex = 0;
  const result = html.replace(
    CODE_BLOCK_OR_WRAPPER_RE,
    (_fullMatch, openWrapTag: string | undefined, wrapBody: string | undefined, plainPreBlock: string | undefined) => {
      if (openWrapTag && wrapBody) {
        if (wrapBody.includes('class="copy-btn"')) {
          return `${openWrapTag}${wrapBody}`;
        }
        return `${openWrapTag}<button class="copy-btn" type="button">Copy</button>${wrapBody}`;
      }
      if (plainPreBlock) {
        return `<div class="code-wrap"><button class="copy-btn" type="button">Copy</button>${plainPreBlock}</div>`;
      }
      return _fullMatch;
    }
  );

  // Validate no nested code-wrappers
  validateNoNestedCodeWraps(result);

  return result;
}

export function validateNoNestedCodeWraps(html: string): void {
  const openWrapRegex = /<div\s+class="code-wrap\b[^"]*"[^>]*>/g;
  const closeDivRegex = /<\/div>/g;

  type TagPos = { type: 'open' | 'close'; index: number };
  const tags: TagPos[] = [];

  let match: RegExpExecArray | null;
  while ((match = openWrapRegex.exec(html)) !== null) {
    tags.push({ type: 'open', index: match.index });
  }
  while ((match = closeDivRegex.exec(html)) !== null) {
    tags.push({ type: 'close', index: match.index });
  }

  tags.sort((a, b) => a.index - b.index);

  let depth = 0;
  for (const tag of tags) {
    if (tag.type === 'open') {
      depth++;
      if (depth > 1) {
        throw new Error('Compilation error: detected illegally nested .code-wrap elements.');
      }
    } else if (tag.type === 'close') {
      if (depth > 0) {
        depth--;
      }
    }
  }
}

