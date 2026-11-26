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
import { escHtml } from '../util/escape.js';
import type { PendingWikilink, ResolvedLink } from '../types.js';

export function wikilinkPlugin(md: MarkdownIt): void {
  md.inline.ruler.before('link', 'wikilink', wikilinkRule);
  md.renderer.rules['wikilink'] = (tokens, idx, _opt, env) => {
    const tok = tokens[idx];
    const target = tok.content;
    const display = tok.info || target;
    const linkMap = env?.linkMap as Map<string, PendingWikilink> | undefined;
    const pw = linkMap?.get(`${target}|${display}`);
    if (!pw?.resolution) return escHtml(`[[${target}]]`);
    const mode = (env?.outputMode || env?.options?.outputMode || 'single') as 'single' | 'split';
    const b64Map = env?.assetBase64Map as Map<string, string> | undefined;
    const parser = (env?.md || md) as MarkdownIt;
    return renderWikilinkToken(target, display, pw.resolution, mode, b64Map, parser, env);
  };
}

function renderWikilinkToken(
  target: string,
  display: string,
  resolved: ResolvedLink,
  outputMode: 'single' | 'split',
  assetBase64Map?: Map<string, string>,
  md?: MarkdownIt,
  env?: Record<string, unknown>,
): string {
  const depth = typeof env?.wikilinkDepth === 'number' ? env.wikilinkDepth : 0;
  const renderDisplay = (text: string) =>
    md && depth < 2
      ? md.renderInline(text, { ...(env ?? {}), wikilinkDepth: depth + 1 })
      : escHtml(text);

  switch (resolved.kind) {
    case 'heading':
      return `<a href="#${escHtml(resolved.heading.id)}">${renderDisplay(display)}</a>`;

    case 'image': {
      if (outputMode === 'single' && assetBase64Map?.has(resolved.asset.absolutePath)) {
        const b64 = assetBase64Map.get(resolved.asset.absolutePath)!;
        return `<img src="${escHtml(b64)}" alt="${escHtml(display)}">`;
      }
      return `<img src="${escHtml(resolved.asset.relativePath)}" alt="${escHtml(display)}">`;
    }

    case 'video': {
      if (outputMode === 'single' && assetBase64Map?.has(resolved.asset.absolutePath)) {
        const b64 = assetBase64Map.get(resolved.asset.absolutePath)!;
        return `<video src="${escHtml(b64)}" controls></video>`;
      }
      return `<video src="${escHtml(resolved.asset.relativePath)}" controls></video>`;
    }

    case 'doc':
      return `<a href="${escHtml(resolved.asset.relativePath)}">${renderDisplay(display)}</a>`;
  }
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

  // Find closing ]] within posMax and on the same line
  const closePos = src.indexOf(']]', pos + 2);
  if (closePos < 0 || closePos + 2 > max) return false;

  const inner = src.slice(pos + 2, closePos);
  if (!inner || inner.includes('\n') || inner.includes('[[')) return false;

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
