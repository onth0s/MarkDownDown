/**
 * markdown-it math plugin for LaTeX expressions.
 * Supports:
 * - Inline math: $...$
 * - Display math (inline / paragraph): $$...$$
 * - Block math: $$ ... $$
 *
 * Rendered at compile-time via KaTeX to clean, accessible HTML/MathML.
 */
import type MarkdownIt from 'markdown-it';
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs';
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs';
import katex from 'katex';

export function mathPlugin(md: MarkdownIt): void {
  md.block.ruler.before('fence', 'math_block', mathBlockRule);
  md.inline.ruler.after('escape', 'math_inline', mathInlineRule);

  md.renderer.rules.math_inline = (tokens, idx) => {
    try {
      return katex.renderToString(tokens[idx].content, {
        displayMode: false,
        throwOnError: false,
      });
    } catch {
      return `<span class="katex-error">${md.utils.escapeHtml(tokens[idx].content)}</span>`;
    }
  };

  md.renderer.rules.math_display = (tokens, idx) => {
    try {
      return katex.renderToString(tokens[idx].content, {
        displayMode: true,
        throwOnError: false,
      });
    } catch {
      return `<div class="katex-error">${md.utils.escapeHtml(tokens[idx].content)}</div>`;
    }
  };

  md.renderer.rules.math_block = (tokens, idx) => {
    try {
      return katex.renderToString(tokens[idx].content, {
        displayMode: true,
        throwOnError: false,
      }) + '\n';
    } catch {
      return `<div class="katex-error">${md.utils.escapeHtml(tokens[idx].content)}</div>\n`;
    }
  };
}

function mathInlineRule(state: StateInline, silent: boolean): boolean {
  const src = state.src;
  const pos = state.pos;
  const max = state.posMax;

  if (src.charCodeAt(pos) !== 0x24 /* $ */) return false;

  const isDisplay = pos + 1 < max && src.charCodeAt(pos + 1) === 0x24;
  const delimiter = isDisplay ? '$$' : '$';
  const start = pos + delimiter.length;

  if (start >= max) return false;

  // Opening delimiter must not be followed by whitespace
  if (!isDisplay && (src[start] === ' ' || src[start] === '\t' || src[start] === '\n')) {
    return false;
  }

  let end = src.indexOf(delimiter, start);
  while (end !== -1) {
    let backslashes = 0;
    let p = end - 1;
    while (p >= start && src.charCodeAt(p) === 0x5c /* \\ */) {
      backslashes++;
      p--;
    }
    if (backslashes % 2 === 0) {
      // Closing delimiter must not be preceded by whitespace (for inline)
      if (!isDisplay && (src[end - 1] === ' ' || src[end - 1] === '\t' || src[end - 1] === '\n')) {
        end = src.indexOf(delimiter, end + 1);
        continue;
      }
      break;
    }
    end = src.indexOf(delimiter, end + 1);
  }

  if (end === -1) return false;

  const content = src.slice(start, end);
  if (!content) return false;

  if (!silent) {
    const token = state.push(isDisplay ? 'math_display' : 'math_inline', isDisplay ? 'div' : 'span', 0);
    token.content = content;
    token.markup = delimiter;
  }
  state.pos = end + delimiter.length;
  return true;
}

function mathBlockRule(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  const bMarks = state.bMarks;
  const tShift = state.tShift;
  const eMarks = state.eMarks;

  const firstLineStart = bMarks[startLine] + tShift[startLine];
  const firstLineEnd = eMarks[startLine];
  const firstLine = state.src.slice(firstLineStart, firstLineEnd).trim();

  if (!firstLine.startsWith('$$')) return false;

  // Single-line block: "$$ ... $$"
  if (firstLine.length > 4 && firstLine.endsWith('$$')) {
    if (!silent) {
      const token = state.push('math_block', 'div', 0);
      token.block = true;
      token.content = firstLine.slice(2, -2).trim();
      token.map = [startLine, startLine + 1];
      token.markup = '$$';
    }
    state.line = startLine + 1;
    return true;
  }

  // Multi-line block
  let nextLine = startLine;
  let foundClose = false;

  while (nextLine < endLine) {
    nextLine++;
    if (nextLine >= endLine) break;

    const lineStart = bMarks[nextLine] + tShift[nextLine];
    const lineEnd = eMarks[nextLine];
    const line = state.src.slice(lineStart, lineEnd).trim();

    if (line.startsWith('$$') || line.endsWith('$$')) {
      foundClose = true;
      break;
    }
  }

  if (!foundClose) return false;

  if (!silent) {
    const lines: string[] = [];
    const restOfFirst = state.src.slice(firstLineStart + 2, firstLineEnd).trim();
    if (restOfFirst) lines.push(restOfFirst);

    for (let l = startLine + 1; l < nextLine; l++) {
      lines.push(state.src.slice(bMarks[l], eMarks[l]));
    }

    const lastLineStart = bMarks[nextLine] + tShift[nextLine];
    const lastLineEnd = eMarks[nextLine];
    const lastLine = state.src.slice(lastLineStart, lastLineEnd).trim();
    const closeTrimmed = lastLine.replace(/^\$\$|\$\$$/g, '').trim();
    if (closeTrimmed) lines.push(closeTrimmed);

    const token = state.push('math_block', 'div', 0);
    token.block = true;
    token.content = lines.join('\n').trim();
    token.map = [startLine, nextLine + 1];
    token.markup = '$$';
  }

  state.line = nextLine + 1;
  return true;
}
