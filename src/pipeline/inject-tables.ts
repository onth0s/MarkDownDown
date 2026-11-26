/**
 * Inject table SVGs into rendered HTML.
 * Finds ```table code blocks and renders them to SVG.
 */
import { tableParse, tableBuildSvg, type LinkResolver } from '../renderer/table-svg.js';
import { escHtml, htmlDecode } from '../util/escape.js';
import { createCodeWrapRegex, extractDecodedDataAttr, extractDataAttr } from '../util/fence.js';
import { toErrorMessage } from '../util/error.js';
import { buildGraphicChrome } from './copy-buttons.js';

/** Render a single table block directly from parsed fence data (no HTML regex pass). */
export function renderTableCodeWrap(params: {
  rawCode: string;
  titleAttr: string;
  safeRawAttr: string;
  docTitle: string;
  warnings: string[];
  linkResolver?: LinkResolver;
  includeChrome?: boolean;
}): string | null {
  const { rawCode, titleAttr, safeRawAttr, docTitle, warnings, linkResolver, includeChrome = false } = params;
  try {
    const tblTitle = titleAttr || docTitle;
    const model = tableParse(rawCode);
    if (!model.headers.length) {
      warnings.push(`table: no headers found, skipped render`);
      return null;
    }
    const svg = tableBuildSvg(model, tblTitle, linkResolver);
    const safeContent = escHtml(rawCode);
    const safeTitle = escHtml(tblTitle);
    const labelsJson = escHtml(JSON.stringify(model.labels));
    const rawOutAttr = safeRawAttr ? ` data-raw="${safeRawAttr}"` : '';
    const chrome = includeChrome ? buildGraphicChrome(safeTitle, true) : '';
    return (
      `<div class="code-wrap table" data-title="${safeTitle}"${rawOutAttr} data-labels="${labelsJson}">` +
      chrome +
      `<pre><code class="language-table">${safeContent}</code></pre>` +
      `<div class="table-render">${svg}</div>` +
      `</div>`
    );
  } catch (err) {
    warnings.push(`table render failed: ${toErrorMessage(err)}`);
    return null;
  }
}

export function injectTableSvgs(
  html: string,
  docTitle: string,
  warnings: string[],
  linkResolver?: LinkResolver,
): string {
  const tableRe = createCodeWrapRegex('table');
  return html.replace(
    tableRe,
    (match, attrs, codeContent) => {
      const titleAttr = extractDecodedDataAttr(attrs, 'title');
      const rawAttr = extractDataAttr(attrs, 'raw');
      const rawCode = htmlDecode(codeContent);
      const rendered = renderTableCodeWrap({
        rawCode,
        titleAttr,
        safeRawAttr: rawAttr,
        docTitle,
        warnings,
        linkResolver,
        includeChrome: false,
      });
      return rendered ?? match;
    }
  );
}
