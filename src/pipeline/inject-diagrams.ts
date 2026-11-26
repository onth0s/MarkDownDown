/**
 * Inject diagram SVGs into rendered HTML.
 * Finds ```diagram code blocks and renders them to SVG.
 */
import { diagramParse, diagramLayout, diagramBuildSvg, resolveGeometry } from '../renderer/diagram/index.js';
import { escHtml, htmlDecode } from '../util/escape.js';
import { createCodeWrapRegex, extractDecodedDataAttr, extractDataAttr } from '../util/fence.js';
import { toErrorMessage } from '../util/error.js';
import { buildGraphicChrome } from './copy-buttons.js';

const TAG_RE = /<[^>]+>/g;

/**
 * Text of the nearest heading above `offset`.
 */
function headingBefore(html: string, offset: number): string {
  const headingRe = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/g;
  let last = '';
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(html)) !== null) {
    if (m.index >= offset) break;
    const text = htmlDecode(m[1].replace(TAG_RE, '')).replace(/\s+/g, ' ').trim();
    if (text) last = text;
  }
  return last;
}

/** Render a single diagram block directly from parsed fence data (no HTML regex pass). */
export function renderDiagramCodeWrap(params: {
  rawCode: string;
  titleAttr: string;
  dirAttr: string;
  safeRawAttr: string;
  fallbackTitle: string;
  warnings: string[];
  includeChrome?: boolean;
}): string | null {
  const { rawCode, titleAttr, dirAttr, safeRawAttr, fallbackTitle, warnings, includeChrome = false } = params;
  const diagTitle = titleAttr || fallbackTitle;
  try {
    const model = diagramParse(rawCode, dirAttr);
    if (model.nodes.size === 0) {
      warnings.push(`diagram: no nodes found, skipped render`);
      return null;
    }
    diagramLayout(model);
    if (model.warnings) warnings.push(...model.warnings);

    const orientations: Array<'TB' | 'LR'> = model.direction === 'auto'
      ? ['TB', 'LR']
      : [model.horizontal ? 'LR' : 'TB'];
    for (const o of orientations) {
      for (const w of resolveGeometry(model, o).warnings) {
        warnings.push(`diagram "${diagTitle}": ${w}`);
      }
    }

    let svg: string;
    if (model.direction === 'auto') {
      const svgTB = diagramBuildSvg(model, diagTitle, false);
      const svgLR = diagramBuildSvg(model, diagTitle, true);
      svg = `<div class="diagram-tb">${svgTB}</div><div class="diagram-lr">${svgLR}</div>`;
    } else {
      svg = diagramBuildSvg(model, diagTitle);
    }
    const safeContent = escHtml(rawCode);
    const safeTitle = escHtml(diagTitle);
    const wrapperClass = model.direction === 'auto' ? 'code-wrap diagram diagram-auto' : 'code-wrap diagram';
    const labelsJson = escHtml(JSON.stringify(model.labels));
    const dirOutAttr = dirAttr ? ` data-direction="${escHtml(dirAttr)}"` : '';
    const rawOutAttr = safeRawAttr ? ` data-raw="${safeRawAttr}"` : '';
    const chrome = includeChrome ? buildGraphicChrome(safeTitle, true) : '';
    return (
      `<div class="${wrapperClass}" data-title="${safeTitle}"${dirOutAttr}${rawOutAttr} data-labels="${labelsJson}">` +
      chrome +
      `<pre><code class="language-diagram">${safeContent}</code></pre>` +
      `<div class="diagram-render">${svg}</div>` +
      `</div>`
    );
  } catch (err) {
    warnings.push(`diagram render failed: ${toErrorMessage(err)}`);
    return null;
  }
}

export function injectDiagramSvgs(html: string, docTitle: string, warnings: string[]): string {
  const diagramRe = createCodeWrapRegex('diagram');
  return html.replace(
    diagramRe,
    (match, attrs, codeContent, offset: number) => {
      const titleAttr = extractDecodedDataAttr(attrs, 'title');
      const dirAttr = extractDataAttr(attrs, 'direction');
      const rawAttr = extractDataAttr(attrs, 'raw');
      const rawCode = htmlDecode(codeContent);
      const fallbackTitle = headingBefore(html, offset) || docTitle;
      const rendered = renderDiagramCodeWrap({
        rawCode,
        titleAttr,
        dirAttr,
        safeRawAttr: rawAttr,
        fallbackTitle,
        warnings,
        includeChrome: false,
      });
      return rendered ?? match;
    }
  );
}
