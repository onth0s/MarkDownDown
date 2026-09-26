/**
 * Inject diagram SVGs into rendered HTML.
 * Finds ```diagram code blocks and renders them to SVG.
 */
import { diagramParse, diagramLayout, diagramBuildSvg, resolveGeometry } from '../renderer/diagram/index.js';
import { escHtml, htmlDecode } from '../util/escape.js';

const DIAGRAM_SVG_RE = /<div class="code-wrap diagram"([^>]*)>\s*<pre><code class="language-diagram">([\s\S]*?)<\/code><\/pre>\s*<div class="diagram-render"><\/div>\s*<\/div>/g;
const HEADING_RE = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/g;
const TAG_RE = /<[^>]+>/g;

/**
 * Text of the nearest heading above `offset`.
 *
 * A diagram with no `TITLE:` directive used to fall back to the *document*
 * title, so most diagrams in a document ended up with an identical
 * `aria-label` and a screen reader announced the same thing repeatedly. The
 * heading the diagram sits under is a far better description.
 */
function headingBefore(html: string, offset: number): string {
  let last = '';
  HEADING_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HEADING_RE.exec(html)) !== null) {
    if (m.index >= offset) break;
    const text = htmlDecode(m[1].replace(TAG_RE, '')).replace(/\s+/g, ' ').trim();
    if (text) last = text;
  }
  return last;
}

export function injectDiagramSvgs(html: string, docTitle: string, warnings: string[]): string {
  DIAGRAM_SVG_RE.lastIndex = 0;
  return html.replace(
    DIAGRAM_SVG_RE,
    (match, attrs, codeContent, offset: number) => {
      const titleMatch = attrs.match(/data-title="([^"]*)"/);
      const dirMatch = attrs.match(/data-direction="([^"]*)"/);
      const rawMatch = attrs.match(/data-raw="([^"]*)"/);
      const titleAttr = titleMatch ? titleMatch[1] : '';
      const dirAttr = dirMatch ? dirMatch[1] : '';
      const rawAttr = rawMatch ? rawMatch[1] : '';

      const rawCode = htmlDecode(codeContent);
      const diagTitle = titleAttr || headingBefore(html, offset) || docTitle;
      const model = diagramParse(rawCode, dirAttr);
      if (model.nodes.size === 0) {
        warnings.push(`diagram: no nodes found, skipped render`);
        return match;
      }
      diagramLayout(model);
      if (model.warnings) warnings.push(...model.warnings);

      // Surface anything the geometry pass could not repair. Node-to-node
      // overlap is a hard error, but an edge that could not be re-routed, or a
      // label that could not be moved clear, is worth telling the author about
      // rather than failing the build over.
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
      const wrapperClass = model.direction === 'auto' ? 'code-wrap diagram diagram-auto' : 'code-wrap diagram';
      const labelsJson = escHtml(JSON.stringify(model.labels));
      const dirOutAttr = dirAttr ? ` data-direction="${escHtml(dirAttr)}"` : '';
      const rawOutAttr = rawAttr ? ` data-raw="${rawAttr}"` : '';
      return (
        `<div class="${wrapperClass}" data-title="${escHtml(diagTitle)}"${dirOutAttr}${rawOutAttr} data-labels="${labelsJson}">` +
        `<pre><code class="language-diagram">${safeContent}</code></pre>` +
        `<div class="diagram-render">${svg}</div>` +
        `</div>`
      );
    }
  );
}
