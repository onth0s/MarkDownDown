/**
 * Wrap code blocks with copy-to-clipboard buttons without nesting or unclosed tags.
 *
 * 1. Fenced diagram/table blocks already have an outer .code-wrap parent —
 *    insert the copy button right after the opening div tag.
 * 2. Plain <pre><code blocks (standard fenced code) don't have a wrapper —
 *    wrap the entire <pre><code...</code></pre> block in a .code-wrap div with the copy button inside.
 * 3. Validate that no .code-wrap divs are nested within each other; throw an error if detected.
 */
import { CompileError } from '../util/error.js';

/**
 * Download buttons for graphic code blocks.
 *
 * The icons are decorative: each button already carries `aria-label` and
 * `title`, so exposing the SVG as well would announce the same control twice.
 * `aria-hidden` + `focusable="false"` matches how the brand logo is emitted in
 * renderer/logo.ts.
 */
const DOWNLOAD_BTNS_HTML =
  '<div class="code-actions">' +
  '<button class="download-btn" data-format="svg" type="button" aria-label="Download SVG" title="Download SVG">' +
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
  '<span>SVG</span></button>' +
  '<button class="download-btn" data-format="jpg" type="button" aria-label="Download JPG" title="Download JPG">' +
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>' +
  '<span>JPG</span></button>' +
  '</div>';

/**
 * Finds the index right after the closing </div> that balances the <div> starting at startIndex.
 */
function findMatchingClosingDiv(html: string, startIndex: number): number {
  let depth = 0;
  const tagRe = /<\/?div\b[^>]*>/gi;
  tagRe.lastIndex = startIndex;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(html)) !== null) {
    if (match[0].startsWith('</')) {
      depth--;
      if (depth === 0) {
        return match.index; // start of the closing </div> tag
      }
    } else {
      depth++;
    }
  }
  return -1;
}

export function wrapCodeBlocksWithCopyButtons(html: string): string {
  const tokenRe = /(<div\s+class="[^"]*\bcode-wrap\b[^"]*"[^>]*>)|(<pre><code[\s\S]*?<\/code><\/pre>)|(<table\b[\s\S]*?<\/table>)/gi;
  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRe.exec(html)) !== null) {
    result += html.slice(lastIndex, match.index);

    const [fullMatch, openWrapTag, plainPreBlock, tableBlock] = match;

    if (openWrapTag) {
      const closeDivStart = findMatchingClosingDiv(html, match.index);
      if (closeDivStart === -1) {
        // Fallback if malformed: append match and continue
        result += fullMatch;
        lastIndex = match.index + fullMatch.length;
        continue;
      }

      const wrapBody = html.slice(match.index + openWrapTag.length, closeDivStart);
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

      result += `${openWrapTag}${headerHtml}${prefix}${wrapBody}</div>`;
      lastIndex = closeDivStart + 6; // skip </div>
      tokenRe.lastIndex = lastIndex;
    } else if (plainPreBlock) {
      result += `<div class="code-wrap"><button class="copy-btn" type="button">Copy</button>${plainPreBlock}</div>`;
      lastIndex = match.index + plainPreBlock.length;
    } else if (tableBlock) {
      result += `<div class="code-wrap table"><button class="copy-btn" type="button">Copy</button>${DOWNLOAD_BTNS_HTML}${tableBlock}</div>`;
      lastIndex = match.index + tableBlock.length;
    }
  }

  result += html.slice(lastIndex);

  // Validate no nested code-wrappers
  validateNoNestedCodeWraps(result);

  return result;
}

export function validateNoNestedCodeWraps(html: string): void {
  const divTagRegex = /<\/?div\b[^>]*>/gi;
  const isCodeWrap = (tag: string) => /\bclass\s*=\s*["'][^"']*\bcode-wrap\b/i.test(tag);

  const stack: boolean[] = [];
  let codeWrapOpenCount = 0;

  let match: RegExpExecArray | null;
  while ((match = divTagRegex.exec(html)) !== null) {
    const tag = match[0];
    if (tag.startsWith('</')) {
      if (stack.length > 0) {
        const wasWrap = stack.pop();
        if (wasWrap) codeWrapOpenCount--;
      }
    } else {
      const wrap = isCodeWrap(tag);
      if (wrap) {
        if (codeWrapOpenCount > 0) {
          throw new CompileError('Compilation error: detected illegally nested .code-wrap elements.');
        }
        codeWrapOpenCount++;
      }
      stack.push(wrap);
    }
  }
}

