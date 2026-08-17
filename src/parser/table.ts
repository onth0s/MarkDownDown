/**
 * markdown-it fence rule for ```table blocks.
 * Similar to diagram.ts: wraps in .code-wrap.table.
 */
import type MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import type { Options } from 'markdown-it';

export function tablePlugin(md: MarkdownIt): void {
  const defaultFence = md.renderer.rules.fence!.bind(md.renderer);

  md.renderer.rules.fence = (
    tokens: Token[],
    idx: number,
    options: Options,
    env: unknown,
    self: MarkdownIt['renderer']
  ): string => {
    const token = tokens[idx];
    if (token.info.trim() !== 'table') {
      return defaultFence(tokens, idx, options, env, self);
    }

    let content = token.content;
    let title = '';

    const firstLine = content.split('\n')[0].trim();
    if (firstLine.toUpperCase().startsWith('TITLE:')) {
      title = firstLine.slice(6).trim();
      content = content.slice(content.indexOf('\n') + 1);
    }

    const safeTitle = title.replace(/"/g, '&quot;');
    const safeContent = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return (
      `<div class="code-wrap table" data-title="${safeTitle}">` +
      `<pre><code class="language-table">${safeContent}</code></pre>` +
      `<div class="table-render"></div>` +
      `</div>\n`
    );
  };
}
