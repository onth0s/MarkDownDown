import { createMarkdownParser } from '../src/parser/markdown.js';
import { canonicalize } from '../src/pipeline/check/canonicalize.js';
import { resolveHeading } from '../src/resolver/heading.js';
import { resolveAsset } from '../src/resolver/asset.js';
import { resolveWikilink } from '../src/resolver/wikilink.js';
import type { Asset, Heading } from '../src/types.js';

describe('Phase 2 parser, resolver, and canonicalizer regressions', () => {
  test('alerts handles empty [!] without leaving unclosed <div> or stray </blockquote>', () => {
    const md = createMarkdownParser();
    const html = md.render('> [!]\n');
    expect(html).toContain('<div class="alert">');
    expect(html).toContain('</div>');
    expect(html).not.toContain('</blockquote>');
  });

  test('alerts does not hijack nested blockquotes', () => {
    const md = createMarkdownParser();
    const html = md.render('> > [!NOTE]\n> > inner\n');
    expect(html).toMatch(/^<blockquote>\s*<div class="alert"/);
  });

  test('canonicalize preserves link href, math_inline, and math_block', () => {
    const md = createMarkdownParser();
    const a = canonicalize(md, '[link](https://a.example) $x+1$\n\n$$\ny = 2\n$$\n');
    const b = canonicalize(md, '[link](https://b.example) $x+1$\n\n$$\ny = 2\n$$\n');
    const c = canonicalize(md, '[link](https://a.example) $x+2$\n\n$$\ny = 2\n$$\n');
    const d = canonicalize(md, '[link](https://a.example) $x+1$\n\n$$\ny = 3\n$$\n');
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe(d);
  });

  test('resolveHeading handles non-ASCII/emoji headings without false-matching everything', () => {
    const headings: Heading[] = [
      { text: '🚀', id: 'rocket', level: 1 },
      { text: '日本語', id: 'jp', level: 2 },
      { text: 'Node.js', id: 'nodejs', level: 2 },
      { text: 'API', id: 'api', level: 2 },
      { text: 'REST API Reference', id: 'rest-api', level: 2 },
    ];
    expect(resolveHeading('---', headings).type).toBe('not-found');
    expect(resolveHeading('日本語', headings)).toMatchObject({ type: 'match', heading: { id: 'jp' } });
    expect(resolveWikilink('Node.js', 'Node.js', headings, [])).toMatchObject({ kind: 'heading', heading: { id: 'nodejs' } });
    expect(resolveHeading('API', headings)).toMatchObject({ type: 'match', heading: { id: 'api' } });
  });

  test('resolveAsset disambiguates subdirectories and normalizes Windows backslashes', () => {
    const assets: Asset[] = [
      { key: 'a/logo.png', absolutePath: '/assets/a/logo.png', relativePath: 'a/logo.png', kind: 'image' },
      { key: 'b/logo.png', absolutePath: '/assets/b/logo.png', relativePath: 'b/logo.png', kind: 'image' },
    ];
    expect(resolveAsset('a/logo.png', assets)?.relativePath).toBe('a/logo.png');
    expect(resolveAsset('a\\logo.png', assets)?.relativePath).toBe('a/logo.png');
    expect(resolveAsset('missing/logo.png', assets)).toBeNull();
  });
});
