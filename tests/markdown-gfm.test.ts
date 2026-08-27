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

describe('callout alert line breaks', () => {
  test('consecutive "> ..." lines in a bare "[!]" alert break with <br>', () => {
    const html = render('> [!]\n> Free as in **Freedom**.\n> Free as **free beer**.\n');
    expect(html).toContain('class="alert"');
    expect(html).toContain('Free as in <strong>Freedom</strong>.<br>Free as <strong>free beer</strong>.');
  });

  test('titled alert breaks multi-line bodies with <br>', () => {
    const html = render('> [!NOTE]\n> First line.\n> Second line.\n');
    expect(html).toContain('alert-label');
    expect(html).toContain('First line.<br>Second line.');
  });

  test('alert body keeps inline markdown across line breaks', () => {
    const html = render('> [!WARNING]\n> **Bold** and `code`.\n> *Italic* too.\n');
    expect(html).toContain('<strong>Bold</strong> and <code>code</code>.<br><em>Italic</em> too.');
  });

  test('blank-line-separated alert lines stay separate paragraphs without <br>', () => {
    const html = render('> [!]\n> First.\n>\n> Second.\n');
    expect(html.match(/<br>/g) || []).toHaveLength(0);
    expect(html).toContain('<p>First.</p>\n<p>Second.</p>');
  });

  test('plain blockquotes (non-alert) are not affected', () => {
    const html = render('> Walk the line.\n> Walk it twice.\n');
    expect(html).not.toContain('<br>');
    expect(html).toContain('<blockquote>');
  });
});
