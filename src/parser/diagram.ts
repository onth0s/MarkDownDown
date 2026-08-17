/**
 * markdown-it fence rule for ```diagram blocks.
 * Wraps the block in a .code-wrap.diagram div with data-title and
 * produces both the visible <pre><code> (searchable) and
 * a .diagram-render div (SVG will be injected by the compiler).
 */
import type MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import type { Options } from 'markdown-it';

export function diagramPlugin(md: MarkdownIt): void {
  const defaultFence = md.renderer.rules.fence!.bind(md.renderer);

  md.renderer.rules.fence = (
    tokens: Token[],
    idx: number,
    options: Options,
    env: unknown,
    self: MarkdownIt['renderer']
  ): string => {
    const token = tokens[idx];
    if (token.info.trim() !== 'diagram') {
      return defaultFence(tokens, idx, options, env, self);
    }

    let content = token.content;
    let title = '';

    // Strip TITLE: directive from first line
    const firstLine = content.split('\n')[0].trim();
    if (firstLine.toUpperCase().startsWith('TITLE:')) {
      title = firstLine.slice(6).trim();
      content = content.slice(content.indexOf('\n') + 1);
    }

    const safeTitle = title.replace(/"/g, '&quot;');
    const safeContent = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return (
      `<div class="code-wrap diagram" data-title="${safeTitle}">` +
      `<pre><code class="language-diagram">${safeContent}</code></pre>` +
      `<div class="diagram-render"></div>` +
      `</div>\n`
    );
  };
}

/**
 * Parse TITLE: directive from raw diagram/table source.
 * Returns { title, body } where body has the TITLE: line removed.
 */
export function parseTitleDirective(source: string): { title: string; body: string } {
  const lines = source.split('\n');
  const first = lines[0].trim();
  if (first.toUpperCase().startsWith('TITLE:')) {
    return {
      title: first.slice(6).trim(),
      body: lines.slice(1).join('\n'),
    };
  }
  return { title: '', body: source };
}
