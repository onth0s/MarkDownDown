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
      expect(output).toBe('.article h1{color: #3b82f6;margin-top: 10px}');
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
      expect(output).toContain('return a+b');
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
  });
});
