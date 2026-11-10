import type MarkdownIt from 'markdown-it';
import { uniqueSlug } from './headings.js';

// Support callout alerts with optional string identifier: [!] or [!STRING]
const ALERT_RE = /^\[!(?:([a-zA-Z0-9_\u00C0-\u024F\s-]+))?\](?:\r?\n|\s+|$)/i;

/**
 * Alerts plugin: converts GitHub-style blockquote alerts ([!NOTE], [!WARNING], etc.)
 * into styled .alert divs with .alert-title bars and preserves intra-alert line breaks.
 */
export function alertsPlugin(md: MarkdownIt): void {
  md.core.ruler.after('block', 'github_alerts', (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'blockquote_open') continue;

      let firstInlineIdx = -1;
      for (let j = i + 1; j < tokens.length; j++) {
        if (tokens[j].type === 'blockquote_close') break;
        if (tokens[j].type === 'inline') {
          firstInlineIdx = j;
          break;
        }
      }

      if (firstInlineIdx === -1) continue;
      const inlineTok = tokens[firstInlineIdx];
      const match = inlineTok.content.match(ALERT_RE);
      if (!match) continue;

      const rawType = (match[1] || '').trim();
      const title = rawType ? (rawType.charAt(0).toUpperCase() + rawType.slice(1)) : '';

      inlineTok.content = inlineTok.content.slice(match[0].length).trim();
      if (inlineTok.children && inlineTok.children.length > 0) {
        const firstChild = inlineTok.children[0];
        if (firstChild.type === 'text') {
          firstChild.content = firstChild.content.replace(/^\[!(?:[a-zA-Z0-9_\u00C0-\u024F\s-]+)?\](?:\r?\n|\s+)?/i, '').trim();
        }
      }

      // If the inline token is now empty and wrapped in paragraph_open/close, remove the paragraph wrapper
      if (!inlineTok.content && tokens[firstInlineIdx - 1]?.type === 'paragraph_open' && tokens[firstInlineIdx + 1]?.type === 'paragraph_close') {
        tokens.splice(firstInlineIdx - 1, 3);
      }

      const bqOpen = tokens[i];
      bqOpen.tag = 'div';
      bqOpen.attrSet('class', 'alert');
      if (title) {
        bqOpen.meta = Object.assign(bqOpen.meta || {}, { alertTitle: title });
        bqOpen.attrSet('id', uniqueSlug(state, title));
      }

      if (title) {
        const titleTok = new state.Token('html_inline', '', 0);
        titleTok.content = `<div class="alert-title"><span class="alert-label">${title}</span></div>\n`;
        tokens.splice(i + 1, 0, titleTok);
      }

      let depth = 1;
      for (let k = i + 2; k < tokens.length; k++) {
        if (tokens[k].type === 'blockquote_open') depth++;
        else if (tokens[k].type === 'blockquote_close') {
          depth--;
          if (depth === 0) {
            tokens[k].tag = 'div';
            break;
          }
        }
      }
    }
  });

  // Preserve line breaks between consecutive "> ..." lines inside alert callouts.
  // CommonMark softbreaks collapse to a space in HTML; turn them into <br>.
  // Runs after the inline pass so token children are populated.
  md.core.ruler.after('inline', 'alert_linebreaks', (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const open = tokens[i];
      if (open.type !== 'blockquote_open' || open.tag !== 'div') continue;
      if (!open.attrGet('class')?.includes('alert')) continue;

      let depth = 1;
      for (let k = i + 1; k < tokens.length; k++) {
        const tok = tokens[k];
        if (tok.type === 'blockquote_open') {
          depth++;
          continue;
        }
        if (tok.type !== 'blockquote_close') continue;
        depth--;
        if (depth === 0) {
          for (let m = i + 1; m < k; m++) {
            const inline = tokens[m];
            if (inline.type !== 'inline' || !inline.children) continue;
            const children: typeof inline.children = [];
            for (const child of inline.children) {
              if (child.type === 'softbreak') {
                const brOpen = new state.Token('br_open', 'br', 0);
                children.push(brOpen);
                const brClose = new state.Token('br_close', 'br', -1);
                brClose.hidden = true;
                children.push(brClose);
              } else {
                children.push(child);
              }
            }
            inline.children = children;
          }
          break;
        }
      }
    }
  });
}
