import { resolveWikilink } from '../src/resolver/collision.js';
import type { Heading, Asset } from '../src/types.js';

const headings: Heading[] = [
  { text: 'Overview', id: 'overview', level: 1 },
  { text: 'Architecture', id: 'architecture', level: 2 },
];

const assets: Asset[] = [
  { key: 'logo.png', absolutePath: '/assets/logo.png', relativePath: 'logo.png', kind: 'image' },
  { key: 'diagram.svg', absolutePath: '/assets/diagram.svg', relativePath: 'diagram.svg', kind: 'image' },
  { key: 'docs/guide.mdd', absolutePath: '/assets/docs/guide.mdd', relativePath: 'docs/guide.mdd', kind: 'mdd' },
];

describe('resolveWikilink - heading resolution', () => {
  test('resolves heading by exact name', () => {
    const result = resolveWikilink('Overview', 'Overview', headings, assets);
    expect(result.kind).toBe('heading');
  });

  test('heading-first: no-extension str resolves to heading, not file', () => {
    // If both a heading "Architecture" and an asset exist, heading wins
    const result = resolveWikilink('Architecture', 'Architecture', headings, assets);
    expect(result.kind).toBe('heading');
  });
});

describe('resolveWikilink - extension fast-path', () => {
  test('[[logo.png]] skips heading resolution → image', () => {
    const result = resolveWikilink('logo.png', 'logo.png', headings, assets);
    expect(result.kind).toBe('image');
  });

  test('[[diagram.svg]] → image', () => {
    const result = resolveWikilink('diagram.svg', 'diagram.svg', headings, assets);
    expect(result.kind).toBe('image');
  });

  test('[[docs/guide.mdd]] → doc', () => {
    const result = resolveWikilink('docs/guide.mdd', 'guide', headings, assets);
    expect(result.kind).toBe('doc');
  });
});

describe('resolveWikilink - not found', () => {
  test('throws on unresolvable reference', () => {
    expect(() =>
      resolveWikilink('NonExistentSection', 'NE', headings, assets)
    ).toThrow();
  });
});

describe('resolveWikilink - display text', () => {
  test('aliased wikilink uses custom display', () => {
    const result = resolveWikilink('Overview', 'See Overview', headings, assets);
    if (result.kind === 'heading') {
      expect(result.display).toBe('See Overview');
    }
  });
});
