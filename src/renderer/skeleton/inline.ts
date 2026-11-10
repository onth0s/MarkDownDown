import type Token from 'markdown-it/lib/token.mjs';
import { PROSE } from '../skeleton.js';
import { locate, isProseChild } from './locate.js';

/**
 * Build the template segments for one inline block.
 */
export function inlineSegments(content: string, children: Token[]): { segs: (string | number)[]; spans: string[] } {
  const segs: (string | number)[] = [];
  const spans: string[] = [];
  let cursor = 0;
  let openMarker = false;
  let suppressNext = false;
  let groupStart = 0;

  const flush = (): void => {
    if (openMarker) {
      segs.push(PROSE);
      spans.push(content.slice(groupStart, cursor));
      openMarker = false;
    }
  };

  const emitSpan = (until: number): boolean => {
    const span = content.slice(cursor, until);
    const nl = span.indexOf('\n');
    let stripped = false;
    if (suppressNext && nl >= 0) {
      groupStart = cursor + nl;
      segs.push(span.slice(0, nl) + span.slice(nl + 1));
      stripped = true;
    } else {
      segs.push(span);
    }
    suppressNext = false;
    return stripped;
  };

  for (let i = 0; i < children.length; i++) {
    const c = children[i];

    if (c.type === 'softbreak') {
      const nxt = children[i + 1];
      if (nxt?.type === 'text' && nxt.content !== '') {
        suppressNext = true;
        continue;
      }
      const nl = content.indexOf('\n', cursor);
      if (nl >= 0) {
        if (!openMarker && i > 0) {
          segs.push(PROSE);
          spans.push(content.slice(nl, nl + 1));
        }
        cursor = nl + 1;
        suppressNext = false;
      } else {
        suppressNext = true;
      }
      continue;
    }

    if (c.type === 'text') {
      if (c.content === '') continue;
      const loc = locate(content, c.content, cursor);
      if (loc) {
        if (!openMarker) {
          const stripped = emitSpan(loc.at);
          if (!stripped) groupStart = loc.at;
          openMarker = true;
        }
        cursor = loc.at + loc.len;
        suppressNext = false;
      } else {
        if (!openMarker) {
          const stripped = emitSpan(cursor);
          if (!stripped) groupStart = cursor;
          openMarker = true;
        }
        cursor = Math.min(cursor + c.content.length, content.length);
        suppressNext = false;
      }
      continue;
    }

    if (isProseChild(c)) {
      const want = c.type === 'wikilink' ? (c.info !== undefined && c.info !== '' ? c.info : c.content) : c.content;
      if (openMarker) flush();
      const loc = locate(content, want, cursor);
      if (loc) {
        const stripped = emitSpan(loc.at);
        if (!stripped) groupStart = loc.at;
        segs.push(PROSE);
        spans.push(content.slice(groupStart, loc.at + loc.len));
        cursor = loc.at + loc.len;
      } else {
        const stripped = emitSpan(cursor);
        if (!stripped) groupStart = cursor;
        segs.push(PROSE);
        spans.push(content.slice(groupStart, Math.min(cursor + (want ?? '').length, content.length)));
        cursor = Math.min(cursor + (want ?? '').length, content.length);
      }
      suppressNext = false;
      continue;
    }

    flush();
  }

  flush();
  segs.push(content.slice(cursor));
  return { segs, spans };
}
