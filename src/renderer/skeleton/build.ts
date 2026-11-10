import type MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import { detectEol, extractFrontmatter, type Skeleton } from '../skeleton.js';
import { trailingWhitespace } from './locate.js';
import { inlineSegments } from './inline.js';
import { containerSegments, scanContainer } from './container.js';

export const CONTAINER_TYPES = new Set(['bullet_list_open', 'ordered_list_open', 'blockquote_open', 'table_open']);
export const BLOCK_LITERAL_TYPES = new Set(['fence', 'code_block', 'hr', 'html_block']);

/**
 * Build a source skeleton: frontmatter verbatim, body as a linear list of
 * literal segments and PROSE slots, dominant line ending captured.
 */
export function buildSkeleton(md: MarkdownIt, rawSource: string, parsedTokens?: Token[]): Skeleton {
  const eol = detectEol(rawSource);
  const src = rawSource.replace(/\r\n/g, '\n');
  const fm = extractFrontmatter(src);
  const body = fm ? src.slice(fm.length) : src;
  const endsWithNewline = body.endsWith('\n');
  const lines = (endsWithNewline ? body.slice(0, -1) : body).split('\n');
  const tokens = parsedTokens ?? md.parse(body, {});

  const segs: (string | number)[] = [];
  const spans: string[] = [];
  const emitInline = (content: string, children: Token[] | null | undefined): void => {
    const r = inlineSegments(content ?? '', children ?? []);
    segs.push(...r.segs);
    spans.push(...r.spans);
  };

  let last = 0;
  const emitRange = (a: number, b: number): void => {
    if (b > a) segs.push(lines.slice(a, b).join('\n') + '\n');
  };

  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    const map = t.map;

    if (t.type === 'heading_open' && map && t.nesting === 1) {
      const inlineTok = tokens[i + 1];
      const inlineIdx = i + 1;
      emitRange(last, map[0]);
      const markup = t.markup ?? '#';
      if (/^#+$/.test(markup)) {
        segs.push(markup, ' ');
        emitInline(inlineTok?.content ?? '', inlineTok?.children);
        segs.push(trailingWhitespace(lines[map[0]] ?? '', inlineTok?.content ?? ''));
        segs.push('\n');
      } else {
        emitInline(inlineTok?.content ?? '', inlineTok?.children);
        if (inlineTok?.map) {
          const title = lines.slice(inlineTok.map[0], inlineTok.map[1]).join('\n');
          segs.push(trailingWhitespace(title, inlineTok.content ?? ''));
        }
        segs.push('\n');
        if (inlineTok?.map) segs.push(lines[inlineTok.map[1]], '\n');
      }
      last = map[1];
      i = inlineIdx + 2;
      continue;
    }

    if (CONTAINER_TYPES.has(t.type) && map && t.nesting === 1) {
      const c = scanContainer(tokens, i);
      const endLine = Math.max(map[1], c.maxMapEnd);
      emitRange(last, map[0]);
      const base = lines.slice(map[0], endLine).join('\n');
      const r = containerSegments(base, c.inlines.map(k => tokens[k]));
      segs.push(...r.segs);
      spans.push(...r.spans);
      segs.push('\n');
      last = endLine;
      i = c.end + 1;
      continue;
    }

    if (t.type === 'inline' && map) {
      emitRange(last, map[0]);
      emitInline(t.content ?? '', t.children);
      segs.push(trailingWhitespace(lines.slice(map[0], map[1]).join('\n'), t.content ?? ''));
      segs.push('\n');
      last = map[1];
      i++;
      continue;
    }

    if (BLOCK_LITERAL_TYPES.has(t.type) && map && t.nesting === 1) {
      emitRange(last, map[0]);
      segs.push(lines.slice(map[0], map[1]).join('\n'));
      segs.push('\n');
      last = map[1];
      i++;
      continue;
    }

    i++;
  }
  emitRange(last, lines.length);

  if (!endsWithNewline) {
    const lastSeg = segs[segs.length - 1];
    if (typeof lastSeg === 'string' && lastSeg.endsWith('\n')) {
      segs[segs.length - 1] = lastSeg.slice(0, -1);
    }
  }

  return { v: 1, fm, b: segs, eol, spans };
}
