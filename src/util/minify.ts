/**
 * High-performance, safe minification utilities.
 * Minifies CSS, JS, SVG, and HTML for monolithic self-contained exports.
 */

import crypto from 'node:crypto';
import { transformSync } from 'esbuild';

/**
 * Minify CSS using esbuild transform.
 */
export function minifyCss(css: string): string {
  try {
    const result = transformSync(css, { loader: 'css', minify: true });
    return result.code.trim();
  } catch {
    return css
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

/**
 * Minify JavaScript safely using esbuild transform.
 */
export function minifyJs(js: string): string {
  try {
    const result = transformSync(js, { loader: 'js', minify: true, target: 'es2020' });
    return result.code.trim();
  } catch {
    return js;
  }
}

/**
 * Minify SVG strings by collapsing tag gaps, rounding floating numbers in path d attributes,
 * and trimming whitespace.
 */
export function minifySvg(svg: string): string {
  return svg
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .replace(/(<[a-zA-Z0-9_-]+)\s+/g, '$1 ')
    .replace(/\s+(d="[^"]+")/g, (_match, dAttr) => {
      const cleaned = dAttr
        .replace(/([A-DF-Za-df-z])\s+/g, '$1')
        .replace(/\s+([A-DF-Za-df-z])/g, '$1')
        .replace(/(\d*\.\d{2})\d+/g, '$1')
        .replace(/\s*"\s*$/, '"')
        .trim();
      return ' ' + cleaned;
    })
    .trim();
}

const BLOCK_TAGS = 'html|head|body|title|meta|link|style|script|div|section|article|aside|header|footer|nav|main|ul|ol|li|table|thead|tbody|tr|th|td|blockquote|h[1-6]|p|hr';
const BLOCK_CLOSE_OPEN_RE = new RegExp(`>(?:\\s+)<(?=/?(?:${BLOCK_TAGS})\\b)`, 'gi');
const BLOCK_TAG_OPEN_RE = new RegExp(`(</?(?:${BLOCK_TAGS})[^>]*>)(?:\\s+)<`, 'gi');

/**
 * Minify monolithic HTML document.
 * Preserves the exact contents of <pre><code>...</code></pre> tags and code-wrap data attributes.
 */
export function minifyHtml(html: string): string {
  const protectedBlocks: string[] = [];
  const nonce = crypto.randomBytes(4).toString('hex');
  const placeholder = (idx: number) => `<div data-mdd-p-${nonce}="${idx}"></div>`;
  const protect = (match: string): string => {
    protectedBlocks.push(match);
    return placeholder(protectedBlocks.length - 1);
  };

  // Protect code-wrap blocks (including their data-raw attributes and <pre> tags)
  const protectedHtml = html
    .replace(/<script type="application\/json"[^>]*>[\s\S]*?<\/script>/g, protect)
    .replace(/<script[^>]*>[\s\S]*?<\/script>/g, protect)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, protect)
    .replace(/<div class="code-wrap[\s\S]*?<\/pre>/g, protect)
    .replace(/<pre[\s\S]*?<\/pre>/g, protect);

  let minified = protectedHtml
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/[ \t\r\n]+/g, ' ')
    .replace(BLOCK_CLOSE_OPEN_RE, '><')
    .replace(BLOCK_TAG_OPEN_RE, '$1<')
    .trim();

  for (let idx = 0; idx < protectedBlocks.length; idx++) {
    minified = minified.replace(placeholder(idx), () => protectedBlocks[idx]);
  }

  return minified;
}
