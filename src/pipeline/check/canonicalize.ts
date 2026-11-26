import yaml from 'js-yaml';
import type MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import { FRONTMATTER_BLOCK_RE } from '../../parser/frontmatter.js';

export function canonInline(children: Token[] | undefined | null): string {
  if (!children) return '';
  const parts: string[] = [];
  const linkHrefStack: string[] = [];
  for (const c of children) {
    switch (c.type) {
      case 'text':
        parts.push((c.content ?? '').replace(/\s+/g, ' '));
        break;
      case 'softbreak':
      case 'hardbreak':
        parts.push(' ');
        break;
      case 'code_inline':
        parts.push('`' + (c.content ?? '') + '`');
        break;
      case 'math_inline':
        parts.push('$' + (c.content ?? '').trim() + '$');
        break;
      case 'math_display':
        parts.push('$$' + (c.content ?? '').trim() + '$$');
        break;
      case 'em_open':
        parts.push('<em>');
        break;
      case 'em_close':
        parts.push('</em>');
        break;
      case 'strong_open':
        parts.push('<strong>');
        break;
      case 'strong_close':
        parts.push('</strong>');
        break;
      case 's_open':
      case 'del_open':
        parts.push('<s>');
        break;
      case 's_close':
      case 'del_close':
        parts.push('</s>');
        break;
      case 'link_open':
        linkHrefStack.push(c.attrGet('href') ?? '');
        parts.push('[');
        break;
      case 'link_close':
        parts.push('](' + (linkHrefStack.pop() ?? '') + ')');
        break;
      case 'image':
        parts.push('![' + canonInline(c.children as Token[]) + '](' + (c.attrGet('src') ?? '') + ')');
        break;
      case 'wikilink':
        parts.push('[[' + (c.content ?? '') + (c.info && c.info !== c.content ? '|' + c.info : '') + ']]');
        break;
      case 'html_inline':
        parts.push(c.content ?? '');
        break;
      case 'br_open':
        parts.push('<br>');
        break;
      case 'br_close':
        break;
      default:
        parts.push('\u0001' + c.type);
        break;
    }
  }
  return parts.join('');
}

function canonicalSortJson(val: unknown): unknown {
  if (Array.isArray(val)) return val.map(canonicalSortJson);
  if (val && typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(val as Record<string, unknown>).sort()) {
      out[k] = canonicalSortJson((val as Record<string, unknown>)[k]);
    }
    return out;
  }
  return val;
}

export function normalizeFrontmatter(block: string): string {
  try {
    const parsed = yaml.load(block);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return JSON.stringify(canonicalSortJson(parsed));
    }
  } catch {
    // Fall back to line normalization on unparseable YAML
  }
  return block
    .split('\n')
    .map(l => l.trim())
    .filter(l => l !== '' && !l.startsWith('#'))
    .map(l => l.replace(/^["']|["']$/g, '').replace(/\s+/g, ' '))
    .sort()
    .join('\n');
}

export function firstDifference(a: string, b: string): { line: number; source: string; rebuilt: string } | undefined {
  const la = a.split('\n');
  const lb = b.split('\n');
  const n = Math.max(la.length, lb.length);
  for (let i = 0; i < n; i++) {
    if (la[i] !== lb[i]) return { line: i + 1, source: la[i] ?? '<eof>', rebuilt: lb[i] ?? '<eof>' };
  }
  return undefined;
}

export function canonicalize(md: MarkdownIt, src: string): string {
  const fm = src.match(FRONTMATTER_BLOCK_RE);
  const front = fm ? normalizeFrontmatter(fm[1]) : '';
  const body = fm ? src.slice(fm[0].length) : src;

  const tokens = md.parse(body, {});
  const lines: string[] = [];
  for (const t of tokens) {
    if (t.type === 'inline') {
      lines.push(`I(${canonInline(t.children as Token[])})`);
    } else if (t.type === 'fence' || t.type === 'code_block') {
      lines.push(`F(${t.info ?? ''})(${t.content.replace(/\r\n/g, '\n').trimEnd()})`);
    } else if (t.type === 'math_block') {
      lines.push(`M(${t.content.replace(/\r\n/g, '\n').trim()})`);
    } else if (t.type === 'def') {
      continue;
    } else if (t.type === 'hr') {
      lines.push('<hr>');
    } else if (/_open$/.test(t.type)) {
      lines.push('<' + (t.tag || t.type) + '>');
    } else if (/_close$/.test(t.type)) {
      lines.push('</' + (t.tag || t.type) + '>');
    }
  }
  return `${front}\n${lines.join('\n')}`;
}
