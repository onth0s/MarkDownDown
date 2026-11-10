import type Token from 'markdown-it/lib/token.mjs';
import { findInBase, trailingWhitespace } from './locate.js';
import { inlineSegments } from './inline.js';

export interface ContainerScan {
  /** Index of the matching close token. */
  end: number;
  /** Last source line touched inside the container. */
  maxMapEnd: number;
  /** Indexes of the inline tokens inside the container, in order. */
  inlines: number[];
}

/** Find a container's scope from its opening token. */
export function scanContainer(tokens: Token[], open: number): ContainerScan {
  const openType = tokens[open].type;
  const closeType = openType.replace(/_open$/, '_close');
  const inlines: number[] = [];
  let depth = 1;
  let maxMapEnd = tokens[open].map ? tokens[open].map[1] : 0;
  let j = open + 1;
  while (j < tokens.length) {
    const t = tokens[j];
    if (t.type === openType) {
      depth++;
    } else if (t.type === closeType) {
      depth--;
      if (depth === 0) break;
    }
    if (t.map) maxMapEnd = Math.max(maxMapEnd, t.map[1]);
    if (t.type === 'inline') inlines.push(j);
    j++;
  }
  return { end: j, maxMapEnd, inlines };
}

/**
 * Walk a container (list / blockquote / table) against a verbatim slice of its
 * source lines.
 */
export function containerSegments(base: string, inlines: Token[]): { segs: (string | number)[]; spans: string[] } {
  const segs: (string | number)[] = [];
  const spans: string[] = [];
  let cursor = 0;
  for (const tok of inlines) {
    const content = tok.content ?? '';
    if (content === '') continue;
    const found = findInBase(base, content, cursor);
    segs.push(base.slice(cursor, found));
    const r = inlineSegments(content, tok.children ?? []);
    segs.push(...r.segs);
    spans.push(...r.spans);
    const ws = trailingWhitespace(base.slice(found), content);
    if (ws) segs.push(ws);
    cursor = found + content.length + ws.length;
  }
  segs.push(base.slice(cursor));
  return { segs, spans };
}
