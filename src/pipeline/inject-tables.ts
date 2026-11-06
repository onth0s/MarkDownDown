/**
 * Inject table SVGs into rendered HTML.
 * Finds ```table code blocks and renders them to SVG.
 */
import { tableParse, tableBuildSvg } from '../renderer/table-svg.js';
import { escHtml, htmlDecode } from '../util/escape.js';
import { createCodeWrapRegex, extractDataAttr } from '../util/fence.js';
import { toErrorMessage } from '../util/error.js';

const TABLE_SVG_RE = createCodeWrapRegex('table');

export function injectTableSvgs(html: string, docTitle: string, warnings: string[]): string {
  TABLE_SVG_RE.lastIndex = 0;
  return html.replace(
    TABLE_SVG_RE,
    (match, attrs, codeContent) => {
      try {
        const titleAttr = extractDataAttr(attrs, 'title');
        const rawAttr = extractDataAttr(attrs, 'raw');

        const rawCode = htmlDecode(codeContent);
        const tblTitle = titleAttr || docTitle;
        const model = tableParse(rawCode);
        if (!model.headers.length) {
          warnings.push(`table: no headers found, skipped render`);
          return match;
        }
        const svg = tableBuildSvg(model, tblTitle);
        const safeContent = escHtml(rawCode);
        const labelsJson = escHtml(JSON.stringify(model.labels));
        const rawOutAttr = rawAttr ? ` data-raw="${rawAttr}"` : '';
        return (
          `<div class="code-wrap table" data-title="${escHtml(tblTitle)}"${rawOutAttr} data-labels="${labelsJson}">` +
          `<pre><code class="language-table">${safeContent}</code></pre>` +
          `<div class="table-render">${svg}</div>` +
          `</div>`
        );
      } catch (err) {
        warnings.push(`table render failed: ${toErrorMessage(err)}`);
        return match;
      }
    }
  );
}
