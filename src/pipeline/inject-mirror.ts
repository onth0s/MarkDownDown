/**
 * Inject Mirror Mode interactive cards and margin pills into rendered HTML.
 * Finds ```mirror code blocks, parses them using mirrorParse, and renders with mirrorBuildHtml.
 */
import { mirrorParse, mirrorBuildHtml } from '../renderer/mirror/index.js';
import { htmlDecode, escHtml } from '../util/escape.js';
import { toErrorMessage } from '../util/error.js';

const MIRROR_BLOCK_RE = /<div class="code-wrap mirror"([^>]*)>\s*<pre><code class="language-mirror"[^>]*>([\s\S]*?)<\/code><\/pre>\s*<div class="mirror-render"><\/div>\s*<\/div>/g;

export interface MirrorStats {
  blocks: number;
  items: number;
  probes: number;
}

export function injectMirrorBlocks(
  html: string,
  docTitle = '',
  warnings: string[] = [],
): { html: string; stats: MirrorStats } {
  MIRROR_BLOCK_RE.lastIndex = 0;
  let blocks = 0;
  let items = 0;
  let probes = 0;

  const newHtml = html.replace(
    MIRROR_BLOCK_RE,
    (match, attrs, codeContent) => {
      try {
        const titleMatch = attrs.match(/data-title="([^"]*)"/);
        const subkindMatch = attrs.match(/data-subkind="([^"]*)"/);
        const rawMatch = attrs.match(/data-raw="([^"]*)"/);
        const titleAttr = titleMatch ? titleMatch[1] : '';
        const subkindAttr = subkindMatch ? subkindMatch[1] : '';
        const rawAttr = rawMatch ? rawMatch[1] : '';

        const rawCode = htmlDecode(codeContent);
        const model = mirrorParse(rawCode, subkindAttr, `mirror-${blocks + 1}`);
        if (titleAttr && !model.title) {
          model.title = titleAttr;
        }

        if (model.items.length === 0 && model.probes.length === 0) {
          warnings.push(`mirror block (${model.id}): no questions or probes found, skipped render`);
          return match;
        }

        blocks++;
        items += model.items.length;
        probes += model.probes.length;

        const rendered = mirrorBuildHtml(model, titleAttr || docTitle);
        const safeContent = escHtml(rawCode);
        const rawOutAttr = rawAttr ? ` data-raw="${rawAttr}"` : '';
        const subkindOutAttr = subkindAttr ? ` data-subkind="${escHtml(subkindAttr)}"` : '';

        return (
          `<div class="code-wrap mirror" data-title="${escHtml(titleAttr || model.title || '')}"${subkindOutAttr}${rawOutAttr}>` +
          `<pre><code class="language-mirror">${safeContent}</code></pre>` +
          `<div class="mirror-render">${rendered}</div>` +
          `</div>`
        );
      } catch (err) {
        warnings.push(`mirror render failed: ${toErrorMessage(err)}`);
        return match;
      }
    },
  );

  return { html: newHtml, stats: { blocks, items, probes } };
}
