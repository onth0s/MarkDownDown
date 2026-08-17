import { resolveWikilink } from '../src/resolver/collision.js';
import type { Heading, Asset } from '../src/types.js';

const headings: Heading[] = [
  { text: 'Introduction', id: 'introduction', level: 1 },
  { text: 'Getting Started', id: 'getting-started', level: 2 },
  { text: 'API Reference', id: 'api-reference', level: 2 },
];

const assets: Asset[] = [
  { key: 'logo.png', absolutePath: '/assets/logo.png', relativePath: 'logo.png', kind: 'image' },
  { key: 'guide.mdd', absolutePath: '/assets/guide.mdd', relativePath: 'guide.mdd', kind: 'mdd' },
];

describe('resolveWikilink — heading priority', () => {
  test('resolves to heading when heading exists', () => {
    const result = resolveWikilink('Introduction', 'Introduction', headings, assets);
    expect(result.kind).toBe('heading');
  });

  test('heading-first: no-extension str resolves to heading, not file', () => {
    // Even if a file 'logo.png' exists, 'logo' (no extension) matches heading logic first
    const headings2: Heading[] = [{ text: 'logo', id: 'logo', level: 3 }];
    const result = resolveWikilink('logo', 'logo', headings2, assets);
    expect(result.kind).toBe('heading');
  });
});

describe('resolveWikilink — extension fast-path', () => {
  test('[[logo.png]] skips heading resolution → image', () => {
    const result = resolveWikilink('logo.png', 'Logo', headings, assets);
    expect(result.kind).toBe('image');
  });

  test('[[guide.mdd]] → doc', () => {
    const result = resolveWikilink('guide.mdd', 'Guide', headings, assets);
    expect(result.kind).toBe('doc');
  });
});

describe('resolveWikilink — not found', () => {
  test('throws on unresolvable reference', () => {
    expect(() =>
      resolveWikilink('nonexistent', 'Nope', headings, assets)
    ).toThrow('could not be resolved');
  });
});

describe('resolveWikilink — display text', () => {
  test('aliased wikilink uses custom display', () => {
    const result = resolveWikilink('Introduction', 'See Overview', headings, assets);
    expect(result.display).toBe('See Overview');
  });
});
