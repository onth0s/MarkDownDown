/**
 * Pipeline stage: render markdown body to HTML.
 *
 * Renders via markdown-it, injects diagram/table SVGs, and wraps code blocks
 * with copy buttons.
 */
import type { Options, PendingWikilink } from '../types.js';
import type MarkdownIt from 'markdown-it';
import { renderWikilinkToken } from '../parser/markdown.js';
import { diagramParse, diagramLayout, diagramBuildSvg } from '../renderer/diagram-svg.js';
import { tableParse, tableBuildSvg } from '../renderer/table-svg.js';
import { escAttr, htmlDecode } from '../util/escape.js';
import { parseTitleDirective } from '../util/fence.js';

export function renderBody(
  md: MarkdownIt,
  markdownBody: string,
  pendingLinks: PendingWikilink[],
  assetBase64Map: Map<string, string>,
  options: Options,
  docTitle: string,
  warnings: string[],
): string {
  // Build link lookup map for fast render-time access
  const linkMap = new Map<string, PendingWikilink>();
  for (const pw of pendingLinks) {
    linkMap.set(`${pw.target}|${pw.display}`, pw);
  }

  // Custom renderer for wikilink tokens
  md.renderer.rules['wikilink'] = (tokens, idx) => {
    const tok = tokens[idx];
    const target = tok.content;
    const display = tok.info || target;
    const pw = linkMap.get(`${target}|${display}`);
    if (!pw?.resolved) return `[[${target}]]`;
    return renderWikilinkToken(target, display, pw.resolved, options.outputMode, assetBase64Map);
  };

  // Render markdown to HTML
  let bodyHtml = md.render(markdownBody);

  // Inject diagram SVGs
  if (!options.noDiagrams) {
    bodyHtml = bodyHtml.replace(
      /<div class="code-wrap diagram" data-title="([^"]*)">\s*<pre><code class="language-diagram">([\s\S]*?)<\/code><\/pre>\s*<div class="diagram-render"><\/div>\s*<\/div>/g,
      (match, titleAttr, codeContent) => {
        try {
          const rawCode = htmlDecode(codeContent);
          const { title: extractedTitle, body: diagramBody } = parseTitleDirective(rawCode);
          const diagTitle = extractedTitle || titleAttr || docTitle;
          const model = diagramParse(diagramBody);
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
          const wrapperClass = model.direction === 'auto' ? 'code-wrap diagram diagram-auto' : 'code-wrap diagram';
          return (
            `<div class="${wrapperClass}" data-title="${escAttr(diagTitle)}">` +
            `<pre><code class="language-diagram">${codeContent}</code></pre>` +
            `<div class="diagram-render">${svg}</div>` +
            `</div>`
          );
        } catch (err) {
          warnings.push(`diagram render failed: ${(err as Error).message}`);
          return match;
        }
      }
    );
  }

  // Inject table SVGs
  if (!options.noTables) {
    bodyHtml = bodyHtml.replace(
      /<div class="code-wrap table" data-title="([^"]*)">\s*<pre><code class="language-table">([\s\S]*?)<\/code><\/pre>\s*<div class="table-render"><\/div>\s*<\/div>/g,
      (match, titleAttr, codeContent) => {
        try {
          const rawCode = htmlDecode(codeContent);
          const { title: extractedTitle, body: tableBody } = parseTitleDirective(rawCode);
          const tblTitle = extractedTitle || titleAttr || docTitle;
          const model = tableParse(tableBody);
          if (!model.headers.length) {
            warnings.push(`table: no headers found, skipped render`);
            return match;
          }
          const svg = tableBuildSvg(model, tblTitle);
          return (
            `<div class="code-wrap table" data-title="${escAttr(tblTitle)}">` +
            `<pre><code class="language-table">${codeContent}</code></pre>` +
            `<div class="table-render">${svg}</div>` +
            `</div>`
          );
        } catch (err) {
          warnings.push(`table render failed: ${(err as Error).message}`);
          return match;
        }
      }
    );
  }

  // Wrap code blocks + copy buttons
  bodyHtml = bodyHtml.replace(
    /(<div class="code-wrap (?:diagram|table)"[^>]*>)(<pre><code)/g,
    '$1<button class="copy-btn" type="button">Copy</button>$2'
  );
  bodyHtml = bodyHtml.replace(
    /(?<!>)<pre><code/g,
    '<div class="code-wrap"><button class="copy-btn" type="button">Copy</button><pre><code'
  );
  bodyHtml = bodyHtml.replace(
    /(?<!<\/div>)<\/code><\/pre>(?!\s*<div)/g,
    '</code></pre></div>'
  );

  return bodyHtml;
}
