/**
 * Inject Mirror Mode interactive cards and margin pills into rendered HTML.
 * Finds ```mirror code blocks, parses them using mirrorParse, and renders with mirrorBuildHtml.
 */
import { mirrorParse, mirrorBuildHtml, computeMirrorContentHash } from '../renderer/mirror/index.js';
import { resolveHeading } from '../resolver/heading.js';
import { htmlDecode, escHtml } from '../util/escape.js';
import { createCodeWrapRegex, extractDecodedDataAttr, extractDataAttr, parseTitleDirective } from '../util/fence.js';
import { toErrorMessage } from '../util/error.js';
import type { Heading, MirrorBlockModel } from '../types.js';

export interface MirrorStats {
  blocks: number;
  items: number;
  probes: number;
}

function normalizeTarget(raw: string): string {
  let t = raw.trim();
  if (t.startsWith('[[') && t.endsWith(']]')) {
    t = t.slice(2, -2).trim();
  } else if (t.startsWith('#')) {
    t = t.slice(1).trim();
  } else if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

function extractHeadingsFromHtml(sourceHtml: string): Heading[] {
  const list: Heading[] = [];
  const re = /<h([1-6])[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m;
  while ((m = re.exec(sourceHtml)) !== null) {
    const text = htmlDecode(m[3].replace(/<[^>]+>/g, '')).trim();
    list.push({ text, id: m[2], level: parseInt(m[1], 10) });
  }
  return list;
}

/** Resolve a mirror block's TARGET directive against document headings. */
export function resolveMirrorTarget(
  model: MirrorBlockModel,
  docHeadings: Heading[],
  warnings: string[],
  anchorMap: Map<string, { mirrorId: string; title: string }>,
): void {
  if (!model.target) return;
  const norm = normalizeTarget(model.target);
  const matchResult = resolveHeading(norm, docHeadings);
  if (matchResult.type === 'match') {
    model.targetId = matchResult.heading.id;
    anchorMap.set(model.targetId, { mirrorId: model.id, title: model.title || 'Semantic Probe' });
  } else if (matchResult.type === 'ambiguous') {
    warnings.push(
      `mirror block (${model.id}): TARGET "${model.target}" is ambiguous (matches: ${matchResult.candidates.map((c) => c.heading.text).join(', ')})`,
    );
  } else {
    const byId = docHeadings.find((h) => h.id === norm || h.id.toLowerCase() === norm.toLowerCase());
    if (byId) {
      model.targetId = byId.id;
      anchorMap.set(model.targetId, { mirrorId: model.id, title: model.title || 'Semantic Probe' });
    } else {
      warnings.push(`mirror block (${model.id}): TARGET "${model.target}" could not be resolved to any heading`);
    }
  }
}

/** Render a single mirror block directly from parsed fence data. */
export function renderMirrorCodeWrap(params: {
  rawCode: string;
  titleAttr: string;
  subkindAttr: string;
  safeRawAttr: string;
  docTitle: string;
  docHeadings: Heading[];
  warnings: string[];
  seenIds: Map<string, number>;
  anchorMap: Map<string, { mirrorId: string; title: string }>;
  stats: MirrorStats;
  renderInline?: (text: string) => string;
}): string | null {
  const { rawCode, titleAttr, subkindAttr, safeRawAttr, docTitle, docHeadings, warnings, seenIds, anchorMap, stats, renderInline } = params;
  try {
    const hash = computeMirrorContentHash(rawCode);
    const baseId = `mirror-${hash}`;
    const count = seenIds.get(baseId) || 0;
    seenIds.set(baseId, count + 1);
    const blockId = count === 0 ? baseId : `${baseId}-${count + 1}`;

    const model = mirrorParse(rawCode, subkindAttr, blockId);
    if (titleAttr && !model.title) {
      model.title = titleAttr;
    }

    resolveMirrorTarget(model, docHeadings, warnings, anchorMap);

    if (model.items.length === 0 && model.probes.length === 0) {
      warnings.push(`mirror block (${model.id}): no questions or probes found, skipped render`);
      return null;
    }

    stats.blocks++;
    stats.items += model.items.length;
    stats.probes += model.probes.length;

    const rendered = mirrorBuildHtml(model, titleAttr || docTitle, renderInline);
    const safeContent = escHtml(rawCode);
    const rawOutAttr = safeRawAttr ? ` data-raw="${safeRawAttr}"` : '';
    const subkindOutAttr = subkindAttr ? ` data-subkind="${escHtml(subkindAttr)}"` : '';

    return (
      `<div class="code-wrap mirror" data-title="${escHtml(titleAttr || model.title || '')}"${subkindOutAttr}${rawOutAttr}>` +
      `<pre><code class="language-mirror">${safeContent}</code></pre>` +
      `<div class="mirror-render">${rendered}</div>` +
      `</div>`
    );
  } catch (err) {
    warnings.push(`mirror render failed: ${toErrorMessage(err)}`);
    return null;
  }
}

/** Pre-scan mirror fence tokens to populate heading anchor dots before rendering headings. */
export function collectMirrorAnchors(
  tokens: Array<{ type: string; info: string; content: string }>,
  docHeadings: Heading[],
): Map<string, { mirrorId: string; title: string }> {
  const seenIds = new Map<string, number>();
  const anchorMap = new Map<string, { mirrorId: string; title: string }>();
  const dummyWarnings: string[] = [];
  for (const tok of tokens) {
    if (tok.type !== 'fence') continue;
    const infoWords = tok.info.trim().split(/\s+/);
    if (infoWords[0]?.toLowerCase() !== 'mirror') continue;
    const rawSubkind = infoWords[1]?.toLowerCase() ?? '';
    const subkind = /^[a-z0-9_-]+$/.test(rawSubkind) ? rawSubkind : '';
    const { title, body } = parseTitleDirective(tok.content);
    const hash = computeMirrorContentHash(body);
    const baseId = `mirror-${hash}`;
    const count = seenIds.get(baseId) || 0;
    seenIds.set(baseId, count + 1);
    const blockId = count === 0 ? baseId : `${baseId}-${count + 1}`;
    const model = mirrorParse(body, subkind, blockId);
    if (title && !model.title) model.title = title;
    resolveMirrorTarget(model, docHeadings, dummyWarnings, anchorMap);
  }
  return anchorMap;
}

export function injectMirrorBlocks(
  html: string,
  docTitle = '',
  warnings: string[] = [],
  renderInline?: (text: string) => string,
  headings?: Heading[],
): { html: string; stats: MirrorStats } {
  const mirrorRe = createCodeWrapRegex('mirror');
  const stats: MirrorStats = { blocks: 0, items: 0, probes: 0 };
  const seenIds = new Map<string, number>();
  const anchorMap = new Map<string, { mirrorId: string; title: string }>();

  let newHtml = html.replace(
    mirrorRe,
    (match, attrs, codeContent) => {
      const titleAttr = extractDecodedDataAttr(attrs, 'title');
      const subkindAttr = extractDataAttr(attrs, 'subkind');
      const rawAttr = extractDataAttr(attrs, 'raw');
      const rawCode = htmlDecode(codeContent);
      const docHeadings = headings && headings.length > 0 ? headings : extractHeadingsFromHtml(html);

      const rendered = renderMirrorCodeWrap({
        rawCode,
        titleAttr,
        subkindAttr,
        safeRawAttr: rawAttr,
        docTitle,
        docHeadings,
        warnings,
        seenIds,
        anchorMap,
        stats,
        renderInline,
      });
      return rendered ?? match;
    },
  );

  // Inject subtle margin anchor dots into anchored target headings
  if (anchorMap.size > 0) {
    newHtml = newHtml.replace(
      /<h([1-6])([^>]*\bid="([^"]+)"[^>]*)>([\s\S]*?)<\/h\1>/gi,
      (fullMatch, level, attrs, id, innerHtml) => {
        const anchor = anchorMap.get(id);
        if (!anchor) return fullMatch;
        const dotHtml =
          ` <a href="#${escHtml(anchor.mirrorId)}" class="mirror-anchor-dot" data-mirror-target="${escHtml(anchor.mirrorId)}" title="View mirror probe: ${escHtml(anchor.title)}" aria-label="Mirror probe available"></a>`;
        return `<h${level}${attrs}>${innerHtml}${dotHtml}</h${level}>`;
      },
    );
  }

  return { html: newHtml, stats };
}
