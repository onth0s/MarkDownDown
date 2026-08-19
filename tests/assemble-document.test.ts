import { assembleDocument } from '../src/pipeline/assemble.js';
import type { Options, Heading, HeroMeta } from '../src/types.js';

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

  test('assembles full document with hero, headings, and body HTML', () => {
    const assembled = assembleDocument(
      baseOptions,
      { accent: '#3b82f6' },
      hero,
      'Test Doc',
      '#3b82f6',
      '<p>Body text here</p>',
      headings,
    );

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
    const assembled = assembleDocument(
      baseOptions,
      {},
      {},
      'Short Title',
      '#3b82f6',
      '<p>Content</p>',
      [longHeading],
    );

    expect(assembled.js).toContain('…');
  });
});
