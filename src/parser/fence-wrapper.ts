/**
 * Shared markdown-it fence renderer for custom fence languages (diagram, table, mirror).
 * Parses the TITLE: directive and wraps the block in a .code-wrap div.
 */
import type MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import type { Options } from 'markdown-it';
import { parseTitleDirective } from '../util/fence.js';
import { escHtml } from '../util/escape.js';
import type { MarkdownRenderEnv } from '../types.js';
import { renderDiagramCodeWrap } from '../pipeline/inject-diagrams.js';
import { renderTableCodeWrap } from '../pipeline/inject-tables.js';
import { renderMirrorCodeWrap } from '../pipeline/inject-mirror.js';

export interface FenceBlock {
  kind: string;
  aliases?: string[];
  renderDivClass: string;
}

const DEFAULT_FENCE_BLOCKS: FenceBlock[] = [
  { kind: 'diagram', aliases: ['dag', 'graph'], renderDivClass: 'diagram-render' },
  { kind: 'table', renderDivClass: 'table-render' },
  { kind: 'mirror', renderDivClass: 'mirror-render' },
];

/**
 * Registers custom fence handlers on markdown-it using a single dispatch rule.
 */
export function customFencesPlugin(md: MarkdownIt, blocks: FenceBlock[] = DEFAULT_FENCE_BLOCKS): void {
  const defaultFence = md.renderer.rules.fence?.bind(md.renderer) ||
    ((tokens: Token[], idx: number, options: Options, _env: unknown, self: MarkdownIt['renderer']) =>
      self.renderToken(tokens, idx, options));

  md.renderer.rules.fence = (
    tokens: Token[],
    idx: number,
    options: Options,
    env: unknown,
    self: MarkdownIt['renderer']
  ): string => {
    const token = tokens[idx];
    const infoWords = token.info.trim().split(/\s+/);
    const kind = infoWords[0]?.toLowerCase() ?? '';
    const renderEnv = env as MarkdownRenderEnv | undefined;

    const matchedBlock = blocks.find((b) => b.kind === kind || (b.aliases && b.aliases.includes(kind)));
    if (!matchedBlock) {
      const rendered = defaultFence(tokens, idx, options, env, self);
      if (renderEnv?.directWrapRender) {
        return `<div class="code-wrap"><button class="copy-btn" type="button">Copy</button>${rendered}</div>`;
      }
      return rendered;
    }

    const arg = infoWords[1]?.toUpperCase() ?? '';
    const dirStr = /^(TB|TD|BT|LR|RL)$/i.test(arg) ? arg : '';
    const dirAttr = dirStr ? ` data-direction="${dirStr}"` : '';
    const rawSubkind = infoWords[1]?.toLowerCase() ?? '';
    const validSubkind = matchedBlock.kind === 'mirror' && /^[a-z0-9_-]+$/.test(rawSubkind) ? rawSubkind : '';
    const subkindAttr = validSubkind ? ` data-subkind="${escHtml(validSubkind)}"` : '';

    const { title, body } = parseTitleDirective(token.content);
    const safeTitle = escHtml(title);
    const safeContent = escHtml(body);
    const rawFence = `\`\`\`${token.info.trim()}\n${token.content.endsWith('\n') ? token.content : token.content + '\n'}\`\`\``;
    const safeRaw = escHtml(rawFence).replace(/\r?\n/g, '&#10;');

    if (renderEnv?.directWrapRender) {
      const warnings = renderEnv.warnings ?? [];
      const docTitle = renderEnv.docTitle ?? '';
      if (matchedBlock.kind === 'diagram' && !renderEnv.options?.noDiagrams) {
        const fallbackTitle = renderEnv.nearestHeadingByToken?.get(token) || docTitle;
        const rendered = renderDiagramCodeWrap({
          rawCode: body,
          titleAttr: title,
          dirAttr: dirStr,
          safeRawAttr: safeRaw,
          fallbackTitle,
          warnings,
          includeChrome: true,
        });
        if (rendered) return rendered + '\n';
      } else if (matchedBlock.kind === 'table' && !renderEnv.options?.noTables) {
        const rendered = renderTableCodeWrap({
          rawCode: body,
          titleAttr: title,
          safeRawAttr: safeRaw,
          docTitle,
          warnings,
          linkResolver: renderEnv.tableLinkResolver,
          includeChrome: true,
        });
        if (rendered) return rendered + '\n';
      } else if (matchedBlock.kind === 'mirror') {
        const seenIds = renderEnv.mirrorSeenIds ?? new Map<string, number>();
        const anchorMap = renderEnv.mirrorAnchorMap ?? new Map<string, { mirrorId: string; title: string }>();
        const stats = renderEnv.mirrorStats ?? { blocks: 0, items: 0, probes: 0 };
        const rendered = renderMirrorCodeWrap({
          rawCode: body,
          titleAttr: title,
          subkindAttr: validSubkind,
          safeRawAttr: safeRaw,
          docTitle,
          docHeadings: renderEnv.docHeadings ?? [],
          warnings,
          seenIds,
          anchorMap,
          stats,
          renderInline: (text: string) => md.renderInline(text, renderEnv),
        });
        if (rendered) return rendered + '\n';
      }

      // Fallback for skipped/empty custom fences in directWrapRender mode
      const fallbackCopy = matchedBlock.kind === 'mirror' ? '' : '<button class="copy-btn" type="button">Copy</button>';
      return (
        `<div class="code-wrap ${matchedBlock.kind}" data-title="${safeTitle}"${dirAttr}${subkindAttr} data-raw="${safeRaw}">` +
        fallbackCopy +
        `<pre><code class="language-${matchedBlock.kind}">${safeContent}</code></pre>` +
        `<div class="${matchedBlock.renderDivClass}"></div>` +
        `</div>\n`
      );
    }

    return (
      `<div class="code-wrap ${matchedBlock.kind}" data-title="${safeTitle}"${dirAttr}${subkindAttr} data-raw="${safeRaw}">` +
      `<pre><code class="language-${matchedBlock.kind}">${safeContent}</code></pre>` +
      `<div class="${matchedBlock.renderDivClass}"></div>` +
      `</div>\n`
    );
  };
}

export function createFenceRenderer(md: MarkdownIt, block: FenceBlock): void {
  customFencesPlugin(md, [block]);
}

export function diagramPlugin(md: MarkdownIt): void {
  createFenceRenderer(md, { kind: 'diagram', aliases: ['dag', 'graph'], renderDivClass: 'diagram-render' });
}

export function tablePlugin(md: MarkdownIt): void {
  createFenceRenderer(md, { kind: 'table', renderDivClass: 'table-render' });
}

export function mirrorPlugin(md: MarkdownIt): void {
  createFenceRenderer(md, { kind: 'mirror', renderDivClass: 'mirror-render' });
}
