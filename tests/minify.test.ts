import { minifyCss, minifyJs, minifySvg, minifyHtml } from '../src/util/minify.js';

describe('Minification Utilities', () => {
  describe('minifyCss', () => {
    test('removes comments and extra whitespace', () => {
      const input = `
        /* Main heading style */
        .article h1 {
          color: #3b82f6;
          margin-top: 10px;
        }
      `;
      const output = minifyCss(input);
      expect(output).toBe('.article h1{color:#3b82f6;margin-top:10px}');
    });
  });

  describe('minifyJs', () => {
    test('removes comments while preserving strings and operators', () => {
      const input = `
        // Initial setup
        const greeting = "Hello, /* world */";
        /* Multi-line comment */
        function test(a, b) {
          return a + b;
        }
      `;
      const output = minifyJs(input);
      expect(output).toContain('const greeting="Hello, /* world */"');
      expect(output).toContain('return');
      expect(output).not.toContain('// Initial setup');
      expect(output).not.toContain('Multi-line comment');
    });
  });

  describe('minifySvg', () => {
    test('removes comments, spaces between tags, and trims path decimals', () => {
      const input = `
        <!-- SVG diagram -->
        <svg viewBox="0 0 100 100">
          <path d="M 10.12345 20.67891 L 30 40 " fill="blue" />
        </svg>
      `;
      const output = minifySvg(input);
      expect(output).toContain('<svg viewBox="0 0 100 100"><path');
      expect(output).toContain('d="M10.12 20.67L30 40"');
      expect(output).not.toContain('<!-- SVG diagram -->');
    });
  });

  describe('minifyHtml', () => {
    test('collapses whitespace outside pre blocks but protects code block contents', () => {
      const input = `
        <!doctype html>
        <html>
          <body>
            <div>
              <pre><code class="language-js">
  const x = 1;
  const y = 2;
              </code></pre>
            </div>
          </body>
        </html>
      `;
      const output = minifyHtml(input);
      expect(output).toContain('<!doctype html><html><body><div><pre><code class="language-js">');
      expect(output).toContain('  const x = 1;\n  const y = 2;');
    });

    test('never rewrites script or style bodies', () => {
      // The HTML whitespace collapse is only valid BETWEEN tags. Applied to
      // code it is silently destructive: esbuild prints the string literal
      // '\r\n' as a template literal holding a real newline, and the collapse
      // rewrote that to CR + SPACE — so the shipped client compared `sk.eol`
      // against "CR SPACE" and never converted line endings. The whole element
      // is therefore opaque, while the whitespace AROUND it still collapses.
      const js = minifyJs(`
        const CRLF = '\r\n';
        const spaced = 'a   b';
        function tpl() { return \`line one
line two\`; }
      `);
      const css = minifyCss(`
        .a::after { content: "keep   me"; }
        .b { color: #fff; }
      `);
      const input = `
        <html>
          <head>
            <style>
            ${css}
            </style>
          </head>
          <body>
            <script>
            ${js}
            </script>
            <p>text</p>
          </body>
        </html>
      `;
      const output = minifyHtml(input);

      // Script and style bodies survive byte for byte.
      expect(output).toContain(js);
      expect(output).toContain(css);
      // The corruption this guards against, stated concretely.
      expect(output).not.toContain('\r ');
      expect(output).toContain('line one\nline two');
      expect(output).toContain('"keep   me"');
      // Surrounding markup is still minified.
      expect(output).toContain('<p>text</p>');
      expect(output).not.toMatch(/<body>\s+<script>/);
    });

    test('collapses whitespace between script and style tags, not inside them', () => {
      const input = `<body>
  <script>let a = 1;
let b = 2;</script>
  <style>.x { margin: 0 }</style>
  <p>x</p>
</body>`;
      const output = minifyHtml(input);
      expect(output).toContain('<script>let a = 1;\nlet b = 2;</script>');
      expect(output).toContain('<style>.x { margin: 0 }</style>');
      expect(output).toContain('</script><style>');
      expect(output).toContain('</style><p>x</p>');
      expect(output).toContain('<body><script>');
    });

    test('restores blocks verbatim even when they contain $ substitution patterns', () => {
      // As a replacement STRING, `$&`, `$'`, ``$` `` and `$1` are substitution
      // patterns. Shipped code is full of `.replace(re, '$1')`, so restoring
      // with a string re-injected the placeholder and corrupted the block —
      // enough to leak `data-mdd-protected` markers into the artifact and to
      // break the client script outright. The replacer must be a function.
      const js = 'var re = /x/g; s.replace(re, "$1$&$`$\'$$");';
      const fence = 'const tpl = `a${b}c`;\nconst cost = "$5.00 & up";';
      const input = `<html>
  <head><script>${js}</script></head>
  <body>
    <pre><code>${fence}</code></pre>
    <p>after</p>
  </body>
</html>`;
      const output = minifyHtml(input);

      expect(output).toContain(js);
      expect(output).toContain(fence);
      expect(output).not.toContain('data-mdd-protected');
      // The restore happened exactly once each: no duplicated fragments.
      expect(output.match(/s\.replace\(re/g)?.length).toBe(1);
      expect(output).toContain('</pre><p>after</p>');
    });
  });
});
