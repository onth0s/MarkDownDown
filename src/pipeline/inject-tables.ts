/**
 * Inject table SVGs into rendered HTML.
 * Finds ```table code blocks and renders them to SVG.
 */
import { tableParse, tableBuildSvg } from '../renderer/table-svg.js';
import { escAttr, escHtml, htmlDecode } from '../util/escape.js';
import { toErrorMessage } from '../util/error.js';

const TABLE_SVG_RE = /<div class="code-wrap table" data-title="([^"]*)"(?:\s+data-raw="([^"]*)")?>\s*<pre><code class="language-table">([\s\S]*?)<\/code><\/pre>\s*<div class="table-render"><\/div>\s*<\/div>/g;

export function injectTableSvgs(html: string, docTitle: string, warnings: string[]): string {
  TABLE_SVG_RE.lastIndex = 0;
  return html.replace(
    TABLE_SVG_RE,
    (match, titleAttr, rawAttr, codeContent) => {
      try {
        const rawCode = htmlDecode(codeContent);
        const tblTitle = titleAttr || docTitle;
        const model = tableParse(rawCode);
        if (!model.headers.length) {
          warnings.push(`table: no headers found, skipped render`);
          return match;
        }
        const svg = tableBuildSvg(model, tblTitle);
        const safeContent = escHtml(rawCode);
        const labelsJson = escAttr(JSON.stringify(model.labels));
        const rawOutAttr = rawAttr ? ` data-raw="${rawAttr}"` : '';
        return (
          `<div class="code-wrap table" data-title="${escAttr(tblTitle)}"${rawOutAttr} data-labels="${labelsJson}">` +
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
