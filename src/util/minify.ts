/**
 * High-performance, safe minification utilities.
 * Minifies CSS, JS, SVG, and HTML for monolithic self-contained exports.
 */

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
    .replace(/\s*(d="[^"]+")/g, (match, dAttr) => {
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

/**
 * Minify monolithic HTML document.
 * Preserves the exact contents of <pre><code>...</code></pre> tags and code-wrap data attributes.
 */
export function minifyHtml(html: string): string {
  const protectedBlocks: string[] = [];
  const placeholder = (idx: number) => `<!--__PROTECTED_BLOCK_${idx}__-->`;

  // Protect code-wrap blocks (including their data-raw attributes and <pre> tags)
  const protectedHtml = html.replace(/<div class="code-wrap[\s\S]*?<\/pre>/g, (match) => {
    protectedBlocks.push(match);
    return placeholder(protectedBlocks.length - 1);
  }).replace(/<pre[\s\S]*?<\/pre>/g, (match) => {
    protectedBlocks.push(match);
    return placeholder(protectedBlocks.length - 1);
  });

  // Block elements where whitespace between tags can be safely eliminated
  const blockTags = 'html|head|body|title|meta|link|style|script|div|section|article|aside|header|footer|nav|main|ul|ol|li|table|thead|tbody|tr|th|td|blockquote|h[1-6]|p|hr';

  let minified = protectedHtml
    .replace(/<!--(?!__PROTECTED_BLOCK_)[\s\S]*?-->/g, '')
    // Collapse multi-whitespace into a single space
    .replace(/[ \t\r\n]+/g, ' ')
    // Eliminate spaces between closing and opening block-level elements
    .replace(new RegExp(`>(?:\\s+)<(?=/?(?:${blockTags})\\b)`, 'gi'), '><')
    .replace(new RegExp(`(</?(?:${blockTags})[^>]*>)(?:\\s+)<`, 'gi'), '$1<')
    .trim();

  for (let idx = 0; idx < protectedBlocks.length; idx++) {
    minified = minified.replace(placeholder(idx), protectedBlocks[idx]);
  }

  return minified;
}
