/**
 * Wrap code blocks with copy-to-clipboard buttons without nesting or unclosed tags.
 *
 * 1. Fenced diagram/table blocks already have an outer .code-wrap parent —
 *    insert the copy button right after the opening div tag.
 * 2. Plain <pre><code blocks (standard fenced code) don't have a wrapper —
 *    wrap the entire <pre><code...</code></pre> block in a .code-wrap div with the copy button inside.
 * 3. Validate that no .code-wrap divs are nested within each other; throw an error if detected.
 */
const CODE_BLOCK_OR_WRAPPER_RE = /(<div\s+class="[^"]*\bcode-wrap\b[^"]*"[^>]*>)([\s\S]*?<\/div>)|(<pre><code[\s\S]*?<\/code><\/pre>)|(<table\b[\s\S]*?<\/table>)/g;

const DOWNLOAD_BTNS_HTML =
  '<div class="code-actions">' +
  '<button class="download-btn" data-format="svg" type="button" aria-label="Download SVG" title="Download SVG">' +
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
  '<span>SVG</span></button>' +
  '<button class="download-btn" data-format="jpg" type="button" aria-label="Download JPG" title="Download JPG">' +
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>' +
  '<span>JPG</span></button>' +
  '</div>';

export function wrapCodeBlocksWithCopyButtons(html: string): string {
  CODE_BLOCK_OR_WRAPPER_RE.lastIndex = 0;
  const result = html.replace(
    CODE_BLOCK_OR_WRAPPER_RE,
    (_fullMatch, openWrapTag: string | undefined, wrapBody: string | undefined, plainPreBlock: string | undefined, tableBlock: string | undefined) => {
      if (openWrapTag && wrapBody) {
        const isGraphic = openWrapTag.includes('diagram') || openWrapTag.includes('table');
        const hasCopy = wrapBody.includes('class="copy-btn"');
        const hasDl = wrapBody.includes('class="download-btn"');
        const titleMatch = openWrapTag.match(/data-title="([^"]*)"/);
        const titleText = titleMatch ? titleMatch[1].trim() : '';

        let headerHtml = '';
        let prefix = '';
        if (isGraphic && !hasDl) prefix += DOWNLOAD_BTNS_HTML;

        if (isGraphic && titleText) {
          headerHtml = `<div class="code-title-bar"><span class="code-title-text">${titleText}</span>${!hasCopy ? '<button class="copy-btn in-title-bar" type="button">Copy</button>' : ''}</div>`;
        } else if (!hasCopy) {
          prefix += '<button class="copy-btn" type="button">Copy</button>';
        }

        return `${openWrapTag}${headerHtml}${prefix}${wrapBody}`;
      }
      if (plainPreBlock) {
        return `<div class="code-wrap"><button class="copy-btn" type="button">Copy</button>${plainPreBlock}</div>`;
      }
      if (tableBlock) {
        return `<div class="code-wrap table"><button class="copy-btn" type="button">Copy</button>${DOWNLOAD_BTNS_HTML}${tableBlock}</div>`;
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

