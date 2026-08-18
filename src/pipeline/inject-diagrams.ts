/**
 * Inject diagram SVGs into rendered HTML.
 * Finds ```diagram code blocks and renders them to SVG.
 */
import { diagramParse, diagramLayout, diagramBuildSvg } from '../renderer/diagram-svg.js';
import { escAttr, escHtml, htmlDecode } from '../util/escape.js';

const DIAGRAM_SVG_RE = /<div class="code-wrap diagram" data-title="([^"]*)">\s*<pre><code class="language-diagram">([\s\S]*?)<\/code><\/pre>\s*<div class="diagram-render"><\/div>\s*<\/div>/g;

export function injectDiagramSvgs(html: string, docTitle: string, warnings: string[]): string {
  DIAGRAM_SVG_RE.lastIndex = 0;
  return html.replace(
    DIAGRAM_SVG_RE,
    (match, titleAttr, codeContent) => {
      const rawCode = htmlDecode(codeContent);
      const diagTitle = titleAttr || docTitle;
      const model = diagramParse(rawCode);
      if (model.nodes.size === 0) {
        warnings.push(`diagram: no nodes found, skipped render`);
        return match;
      }
      diagramLayout(model);
      let svg: string;
      if (model.direction === 'auto') {
        const svgTB = diagramBuildSvg(model, diagTitle, false);
        const svgLR = diagramBuildSvg(model, diagTitle, true);
        svg = `<div class="diagram-tb">${svgTB}</div><div class="diagram-lr">${svgLR}</div>`;
      } else {
        svg = diagramBuildSvg(model, diagTitle);
      }
      const safeContent = escHtml(rawCode);
      const wrapperClass = model.direction === 'auto' ? 'code-wrap diagram diagram-auto' : 'code-wrap diagram';
      const labelsJson = escAttr(JSON.stringify(model.labels));
      return (
        `<div class="${wrapperClass}" data-title="${escAttr(diagTitle)}" data-labels="${labelsJson}">` +
        `<pre><code class="language-diagram">${safeContent}</code></pre>` +
        `<div class="diagram-render">${svg}</div>` +
        `</div>`
      );
    }
  );
}
