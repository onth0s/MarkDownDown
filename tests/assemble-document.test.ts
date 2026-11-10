import { assembleDocument } from '../src/pipeline/assemble.js';
import type { Options, Heading, HeroMeta, CompileContext } from '../src/types.js';

describe('assembleDocument pure function', () => {
  const baseOptions: Options = {
    title: 'Test Doc',
    assetsDir: './assets',
    accent: '#3b82f6',
    inputFile: 'test.mdd',
    outputPath: 'test.html',
    outputMode: 'single',
    noDiagrams: false,
    noTables: false,
    verbose: false,
    minify: false,
  };

  const headings: Heading[] = [
    { text: 'Introduction', id: 'introduction', level: 1 },
    { text: 'Deep Dive Section', id: 'deep-dive-section', level: 2 },
  ];

  const hero: HeroMeta = {
    kicker: 'Overview',
    subtitle: 'A test document subtitle',
    pills: ['Draft', 'v1.0'],
  };

  function makeContext(overrides: Partial<CompileContext> = {}): CompileContext {
    return {
      options: baseOptions,
      meta: {},
      hero,
      title: 'Test Doc',
      accent: '#3b82f6',
      assetsDir: './assets',
      headings,
      warnings: [],
      md: undefined as unknown as CompileContext['md'],
      ...overrides,
    };
  }

  test('assembles full document with hero, headings, and body HTML', () => {
    const assembled = assembleDocument({
      ctx: makeContext({ meta: { accent: '#3b82f6' } }),
      bodyHtml: '<p>Body text here</p>',
    });

    expect(assembled.html).toContain('Test Doc');
    expect(assembled.html).toContain('Overview');
    expect(assembled.html).toContain('A test document subtitle');
    expect(assembled.html).toContain('Draft');
    expect(assembled.html).toContain('<p>Body text here</p>');
    expect(assembled.css).toBeDefined();
    expect(assembled.js).toBeDefined();
    expect(assembled.finalOutputFile).toBe('test.html');
  });

  test('truncates very long route titles in route map', () => {
    const longHeading: Heading = {
      text: 'This is an extraordinarily long heading title that should definitely be truncated in the route map',
      id: 'long-heading',
      level: 2,
    };
    const assembled = assembleDocument({
      ctx: makeContext({ title: 'Short Title', headings: [longHeading] }),
      bodyHtml: '<p>Content</p>',
    });

    expect(assembled.js).toContain('…');
  });

  test('emits warning when specified customCss file is not found', () => {
    const warnings: string[] = [];
    assembleDocument({
      ctx: makeContext({
        meta: { customCss: 'nonexistent-custom.css' },
        title: 'Title',
        headings: [],
        warnings,
      }),
      bodyHtml: '<p>Body</p>',
    });
    expect(warnings.some((w) => w.includes('custom CSS file not found'))).toBe(true);
  });
});
