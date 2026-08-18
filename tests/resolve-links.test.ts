import { resolveLinks } from '../src/pipeline/resolve-links.js';
import type { Options, Heading, Asset } from '../src/types.js';

function makeInlineToken(children: Array<{ type: string; content: string; info?: string }>) {
  return {
    type: 'inline',
    children: children.map((c) => ({
      type: c.type,
      content: c.content,
      info: c.info ?? '',
    })),
  };
}

const baseOptions: Options = {
  title: 'Test',
  assetsDir: '/tmp/assets',
  accent: '#3b82f6',
  inputFile: '/tmp/test.mdd',
  outputPath: '/tmp/out',
  outputMode: 'single',
  noDiagrams: false,
  noTables: false,
  verbose: false,
};

const headings: Heading[] = [
  { text: 'Introduction', id: 'introduction', level: 1 },
];

const assets: Asset[] = [
  { key: 'logo.png', absolutePath: '/tmp/assets/logo.png', relativePath: 'logo.png', kind: 'image' },
];

describe('resolveLinks', () => {
  test('resolves wikilink to heading', () => {
    const tokens = [makeInlineToken([{ type: 'wikilink', content: 'Introduction', info: 'Introduction' }])];
    const warnings: string[] = [];
    const result = resolveLinks(tokens as never[], headings, assets, baseOptions, warnings);
    expect(result.pendingLinks).toHaveLength(1);
    expect(result.pendingLinks[0].resolution).toBeDefined();
    expect(result.pendingLinks[0].resolution!.kind).toBe('heading');
  });

  test('throws on unresolvable wikilink', () => {
    const tokens = [makeInlineToken([{ type: 'wikilink', content: 'Nonexistent', info: 'Nope' }])];
    const warnings: string[] = [];
    expect(() => resolveLinks(tokens as never[], headings, assets, baseOptions, warnings)).toThrow(
      'Compilation failed'
    );
  });

  test('skips non-wikilink tokens', () => {
    const tokens = [{
      type: 'inline',
      children: [{ type: 'text', content: 'just text', info: '' }],
    }];
    const warnings: string[] = [];
    const result = resolveLinks(tokens as never[], headings, assets, baseOptions, warnings);
    expect(result.pendingLinks).toHaveLength(0);
  });

  test('builds base64 map in single mode', () => {
    const warnings: string[] = [];
    const result = resolveLinks([], headings, assets, {
      ...baseOptions,
      outputMode: 'single',
    }, warnings);
    expect(warnings.some((w) => w.includes('Could not read asset'))).toBe(true);
  });

  test('skips base64 map in split mode', () => {
    const warnings: string[] = [];
    const result = resolveLinks([], headings, assets, {
      ...baseOptions,
      outputMode: 'split',
    }, warnings);
    expect(result.assetBase64Map.size).toBe(0);
  });
});
