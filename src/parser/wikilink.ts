/**
 * markdown-it inline rule for [[wikilinks]].
 *
 * Produces tokens of type 'wikilink' with:
 *   token.content  = target string (before | if present)
 *   token.info     = display string (after | if present; defaults to target)
 *
 * Escaping: \[[ renders as literal [[
 * Inside code spans: handled automatically by markdown-it (inline rule
 * does not fire inside code tokens).
 */
import type MarkdownIt from 'markdown-it';
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs';

export function wikilinkPlugin(md: MarkdownIt): void {
  md.inline.ruler.before('link', 'wikilink', wikilinkRule);
}

function wikilinkRule(state: StateInline, silent: boolean): boolean {
  const src = state.src;
  const pos = state.pos;
  const max = state.posMax;

  // Need at least [[ at current position
  if (pos + 1 >= max) return false;
  if (src.charCodeAt(pos) !== 0x5b /* [ */ || src.charCodeAt(pos + 1) !== 0x5b /* [ */) {
    return false;
  }

  // Find closing ]]
  const closePos = src.indexOf(']]', pos + 2);
  if (closePos < 0) return false;

  const inner = src.slice(pos + 2, closePos);
  if (!inner) return false;

  if (!silent) {
    // Split on | for aliased links: [[target|display]]
    const pipeIdx = inner.indexOf('|');
    const target = pipeIdx >= 0 ? inner.slice(0, pipeIdx) : inner;
    const display = pipeIdx >= 0 ? inner.slice(pipeIdx + 1) : inner;

    const token = state.push('wikilink', '', 0);
    token.content = target.trim();
    token.info = display.trim();
    token.markup = '[[';
  }

  state.pos = closePos + 2;
  return true;
}
