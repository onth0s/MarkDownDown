/**
 * Shared markdown-it fence renderer for custom fence languages (diagram, table).
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

export function createFenceRenderer(md: MarkdownIt, block: FenceBlock): void {
  const defaultFence = md.renderer.rules.fence!.bind(md.renderer);

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
    const matches = kind === block.kind || (block.aliases && block.aliases.includes(kind));
    if (!matches) {
      return defaultFence(tokens, idx, options, env, self);
    }

    const arg = infoWords[1]?.toUpperCase() ?? '';
    const dirAttr = /^(TB|TD|BT|LR|RL)$/i.test(arg) ? ` data-direction="${arg}"` : '';
    const subkindAttr = block.kind === 'mirror' && infoWords[1] ? ` data-subkind="${infoWords[1].toLowerCase()}"` : '';

    const { title, body } = parseTitleDirective(token.content);
    const safeTitle = escHtml(title);
    const safeContent = escHtml(body);
    const rawFence = `\`\`\`${token.info.trim()}\n${token.content.endsWith('\n') ? token.content : token.content + '\n'}\`\`\``;
    const safeRaw = escHtml(rawFence).replace(/\r?\n/g, '&#10;');






    return (
      `<div class="code-wrap ${block.kind}" data-title="${safeTitle}"${dirAttr}${subkindAttr} data-raw="${safeRaw}">` +
      `<pre><code class="language-${block.kind}">${safeContent}</code></pre>` +
      `<div class="${block.renderDivClass}"></div>` +
      `</div>\n`
    );
  };
}
