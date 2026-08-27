import { createMarkdownParser } from '../src/parser/markdown.js';
import { parseFrontmatter } from '../src/parser/frontmatter.js';

const render = (src: string) => createMarkdownParser().render(src);

describe('GFM passthrough & LaTeX (Gotcha #4)', () => {
  test('LaTeX $...$ is literal text, not math', () => {
    const html = render('Lisa Smith Kilpela, Ph.D. $^a$');
    expect(html).toContain('$^a$');
    expect(html).not.toContain('<sup>');
  });
  test('HTML passthrough is disabled (html: false)', () => {
    const html = render('Lisa Smith Kilpela, Ph.D.<sup>a</sup>');
    expect(html).toContain('&lt;sup&gt;');
    expect(html).not.toContain('<sup>a</sup>');
  });
  test('standard GFM tables still render', () => {
    expect(render('| a | b |\n|---|---|\n| 1 | 2 |\n')).toContain('<table>');
  });
});

describe('body content preserved verbatim (Gotcha #7)', () => {
  test('body content preserved verbatim (GFM passthrough)', () => {
    const body = '# Title\n\nParagraph with **bold**, *italic*, and `code`.\n\n- one\n- two\n';
    const r = parseFrontmatter(`---\ntitle: T\n---\n\n${body}`, process.cwd());
    expect(r.body.trim()).toBe(body.trim());
  });
});
