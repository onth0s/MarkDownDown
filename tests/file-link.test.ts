import { resolveFileLink } from '../src/util/file-link.js';
import { createMarkdownParser } from '../src/parser/markdown.js';

describe('file-link utility and markdown parser link resolution', () => {
  test('resolveFileLink ignores non-file links', () => {
    const res = resolveFileLink('https://example.com');
    expect(res.href).toBe('https://example.com');
    expect(res.exists).toBe(true);
    expect(res.warning).toBeUndefined();
  });

  test('resolveFileLink resolves existing files with file:/// protocol', () => {
    const packageJsonUrl = `file:///${process.cwd().replace(/\\/g, '/')}/package.json`;
    const res = resolveFileLink(packageJsonUrl);
    expect(res.exists).toBe(true);
    expect(res.href).toBe(packageJsonUrl);
    expect(res.warning).toBeUndefined();
  });

  test('resolveFileLink warns on non-existent file links without crashing', () => {
    const nonExistent = 'file:///c:/does/not/exist/foo_bar_xyz123.ts#L10';
    const res = resolveFileLink(nonExistent);
    expect(res.exists).toBe(false);
    expect(res.href).toBe(nonExistent);
    expect(res.warning).toContain('File link target not found');
  });

  test('markdown parser parses file:/// links into regular <a> tags and collects warnings', () => {
    const md = createMarkdownParser();
    const warnings: string[] = [];
    const markdown = 'Check [Doc](file:///c:/nonexistent/file.ts#L42) and [Site](https://example.com).';
    const rendered = md.render(markdown, { warnings, inputDir: process.cwd() });

    expect(rendered).toContain('<a href="file:///c:/nonexistent/file.ts#L42">Doc</a>');
    expect(rendered).toContain('<a href="https://example.com">Site</a>');
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('file:///c:/nonexistent/file.ts#L42');
  });
});
