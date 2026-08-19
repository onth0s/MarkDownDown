/**
 * High-performance, safe minification utilities.
 * Minifies CSS, JS, SVG, and HTML for monolithic self-contained exports.
 */

/**
 * Minify CSS by removing comments and collapsing redundant whitespace.
 */
export function minifyCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '') // remove comments
    .replace(/\s+/g, ' ') // collapse multi-whitespace
    .replace(/\s*([{};,>+~])\s*/g, '$1') // trim whitespace around structural delimiters
    .replace(/:\s+/g, ': ') // normalize property colon spacing
    .replace(/;}/g, '}') // remove trailing semicolons before close brace
    .trim();
}

/**
 * Minify JavaScript by removing comments, blank lines, and unnecessary spaces
 * around delimiters while safely preserving strings and regex literals.
 */
export function minifyJs(js: string): string {
  const tokens: Array<{ type: 'string' | 'code'; content: string }> = [];
  let i = 0;
  const len = js.length;
  let codeBuf = '';

  while (i < len) {
    const ch = js[i];
    const next = js[i + 1];

    // String literals ('...', "...", `...`)
    if (ch === "'" || ch === '"' || ch === '`') {
      if (codeBuf) {
        tokens.push({ type: 'code', content: codeBuf });
        codeBuf = '';
      }
      const quote = ch;
      let str = quote;
      i++;
      while (i < len) {
        const c = js[i];
        str += c;
        if (c === '\\') {
          i++;
          if (i < len) str += js[i];
        } else if (c === quote) {
          break;
        }
        i++;
      }
      tokens.push({ type: 'string', content: str });
      i++;
      continue;
    }

    // Line comments (// ...)
    if (ch === '/' && next === '/') {
      i += 2;
      while (i < len && js[i] !== '\n' && js[i] !== '\r') {
        i++;
      }
      continue;
    }

    // Block comments (/* ... */)
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < len && !(js[i] === '*' && js[i + 1] === '/')) {
        i++;
      }
      i += 2;
      continue;
    }

    codeBuf += ch;
    i++;
  }

  if (codeBuf) {
    tokens.push({ type: 'code', content: codeBuf });
  }

  return tokens
    .map((tok) => {
      if (tok.type === 'string') return tok.content;
      return tok.content
        .replace(/\r?\n\s*/g, '\n')
        .replace(/\n+/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/\s*([=+\-*/%&|!<>?:;,{}()[\]])\s*/g, (m, op) => op)
        .replace(/\b(return|typeof|const|let|var|function|case|delete|void|in|instanceof|throw|new|yield|await|else)\b([^\s=+\-*/%&|!<>?:;,{}()[\]])/g, '$1 $2')
        .replace(/([^\s=+\-*/%&|!<>?:;,{}()[\]])\b(in|instanceof)\b/g, '$1 $2');
    })
    .join('')
    .trim();
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
 * Preserves the exact contents of <pre><code>...</code></pre> tags.
 */
export function minifyHtml(html: string): string {
  const preBlocks: string[] = [];
  const placeholder = (idx: number) => `<!--__PRE_BLOCK_${idx}__-->`;

  const protectedHtml = html.replace(/<pre[\s\S]*?<\/pre>/g, (match) => {
    preBlocks.push(match);
    return placeholder(preBlocks.length - 1);
  });

  // Block elements where whitespace between tags can be safely eliminated
  const blockTags = 'html|head|body|title|meta|link|style|script|div|section|article|aside|header|footer|nav|main|ul|ol|li|table|thead|tbody|tr|th|td|blockquote|h[1-6]|p|hr';

  let minified = protectedHtml
    .replace(/<!--(?!__PRE_BLOCK_)[\s\S]*?-->/g, '')
    // Collapse multi-whitespace into a single space
    .replace(/[ \t\r\n]+/g, ' ')
    // Eliminate spaces between closing and opening block-level elements
    .replace(new RegExp(`>(?:\\s+)<(?=/?(?:${blockTags})\\b)`, 'gi'), '><')
    .replace(new RegExp(`(</?(?:${blockTags})[^>]*>)(?:\\s+)<`, 'gi'), '$1<')
    .trim();

  for (let idx = 0; idx < preBlocks.length; idx++) {
    minified = minified.replace(placeholder(idx), preBlocks[idx]);
  }

  return minified;
}
