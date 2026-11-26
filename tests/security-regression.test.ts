import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMarkdownParser } from '../src/parser/markdown.js';
import { parseFrontmatter } from '../src/parser/frontmatter.js';
import { wrapCodeBlocksWithCopyButtons } from '../src/pipeline/copy-buttons.js';
import { processLogo } from '../src/renderer/logo.js';
import { buildJs } from '../src/renderer/js.js';

describe('Phase 1 security & critical regressions', () => {
  test('escapes unresolved wikilinks instead of emitting raw HTML', () => {
    const md = createMarkdownParser();
    const html = md.renderInline('See [[<script>alert(1)</script>]]', {});
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  test('blocks malicious subkind attribute injection on mirror fences', () => {
    const md = createMarkdownParser();
    const html = md.render('```mirror "><script>alert(1)</script>\nQ: Hi\nA: Hello\n```');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('data-subkind');
  });

  test('blocks data:text/html and control-char-smuggled javascript: links', () => {
    const md = createMarkdownParser();
    expect(md.validateLink('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(md.validateLink('\u0001javascript:alert(1)')).toBe(false);
    expect(md.validateLink('https://example.com')).toBe(true);
    expect(md.validateLink('./docs/guide.md')).toBe(true);
    expect(md.validateLink('#section')).toBe(true);
  });

  test('rejects external frontmatter paths by default and warns when overridden', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdpp-fm-sec-'));
    try {
      const src = '---\ncustom_css: ../secret.css\n---\n\nHello';
      expect(() => parseFrontmatter(src, tmpDir, false)).toThrow(/--allow-external-paths/);

      const allowed = parseFrontmatter(src, tmpDir, true);
      expect(allowed.meta.customCss).toBe(path.resolve(tmpDir, '../secret.css'));
      expect(allowed.warnings.some((w) => /external path/i.test(w))).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('copy-buttons does not treat mirror blocks mentioning "diagram" as graphic blocks', () => {
    const html =
      '<div class="code-wrap mirror" data-title="Diagram meaning" data-raw="Q: diagram table">' +
      '<pre><code class="language-mirror">Q: diagram</code></pre>' +
      '<div class="mirror-render"></div></div>';
    const out = wrapCodeBlocksWithCopyButtons(html);
    expect(out).not.toContain('download-btn');
    expect(out).not.toContain('view-toggle-btn');
    expect(out).not.toContain('class="copy-btn"');
  });

  test('sanitizes custom SVG logos and preserves valid style="fill:..." syntax', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdpp-logo-sec-'));
    try {
      const svgPath = path.join(tmpDir, 'bad.svg');
      fs.writeFileSync(
        svgPath,
        '<svg viewBox="0 0 100 100" onload="alert(1)"><script>alert(1)</script><rect style="fill:#3b82f6" width="10" height="10"/></svg>',
      );
      const res = processLogo(svgPath, '#ef4444');
      expect(res.navbarLogo).not.toContain('<script>');
      expect(res.navbarLogo).not.toContain('onload=');
      expect(res.navbarLogo).not.toContain('style="fill="');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('escapes </script> sequences in buildJs JSON payloads', () => {
    const js = buildJs({
      accent: '#3b82f6',
      routes: { intro: '</script><script>alert(1)</script>' },
    });
    expect(js).not.toContain('</script><script>');
    expect(js).toContain('\\u003c/script>');
  });
});
