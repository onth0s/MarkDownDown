/**
 * Shared markdown-it fence renderer for custom fence languages (diagram, table, mirror).
 * Parses the TITLE: directive and wraps the block in a .code-wrap div.
 */
import type MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import type { Options } from 'markdown-it';
import { parseTitleDirective } from '../util/fence.js';
import { escHtml } from '../util/escape.js';

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

    const matchedBlock = blocks.find((b) => b.kind === kind || (b.aliases && b.aliases.includes(kind)));
    if (!matchedBlock) {
      return defaultFence(tokens, idx, options, env, self);
    }

    const arg = infoWords[1]?.toUpperCase() ?? '';
    const dirAttr = /^(TB|TD|BT|LR|RL)$/i.test(arg) ? ` data-direction="${arg}"` : '';
    const subkindAttr = matchedBlock.kind === 'mirror' && infoWords[1] ? ` data-subkind="${infoWords[1].toLowerCase()}"` : '';

    const { title, body } = parseTitleDirective(token.content);
    const safeTitle = escHtml(title);
    const safeContent = escHtml(body);
    const rawFence = `\`\`\`${token.info.trim()}\n${token.content.endsWith('\n') ? token.content : token.content + '\n'}\`\`\``;
    const safeRaw = escHtml(rawFence).replace(/\r?\n/g, '&#10;');

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
