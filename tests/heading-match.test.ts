import { resolveHeading } from '../src/resolver/heading.js';
import type { Heading } from '../src/types.js';

const headings: Heading[] = [
  { text: 'Introduction', id: 'introduction', level: 1 },
  { text: 'Getting Started', id: 'getting-started', level: 2 },
  { text: 'Configuration Options', id: 'configuration-options', level: 2 },
  { text: 'API Reference', id: 'api-reference', level: 2 },
  { text: 'Troubleshooting', id: 'troubleshooting', level: 2 },
];

describe('resolveHeading - Pass 1 (Exact)', () => {
  test('exact match returns the heading', () => {
    const result = resolveHeading('Introduction', headings);
    expect(result.type).toBe('match');
    if (result.type === 'match') {
      expect(result.heading.id).toBe('introduction');
      expect(result.pass).toBe('exact');
    }
  });

  test('exact match is case-sensitive (no match on Pass 1)', () => {
    const result = resolveHeading('introduction', headings);
    if (result.type === 'match') {
      expect(result.pass).not.toBe('exact');
    }
  });
});

describe('resolveHeading - Pass 2 (Normalized)', () => {
  test('lowercase match', () => {
    const result = resolveHeading('introduction', headings);
    expect(result.type).toBe('match');
    if (result.type === 'match') {
      expect(result.heading.id).toBe('introduction');
      expect(result.pass).toBe('normalized');
    }
  });

  test('match ignoring punctuation', () => {
    const result = resolveHeading('Getting Started!', headings);
    expect(result.type).toBe('match');
    if (result.type === 'match') {
      expect(result.heading.id).toBe('getting-started');
    }
  });
});

describe('resolveHeading - Pass 3 (Substring)', () => {
  test('prefix match', () => {
    const result = resolveHeading('API', headings);
    expect(result.type).toBe('match');
    if (result.type === 'match') {
      expect(result.heading.id).toBe('api-reference');
    }
  });

  test('contained substring', () => {
    const result = resolveHeading('Options', headings);
    expect(result.type).toBe('match');
    if (result.type === 'match') {
      expect(result.heading.id).toBe('configuration-options');
    }
  });
});

describe('resolveHeading - Pass 4 (Levenshtein)', () => {
  test('small typo corrected', () => {
    const result = resolveHeading('Introductoin', headings);
    expect(result.type).toBe('match');
    if (result.type === 'match') {
      expect(result.heading.id).toBe('introduction');
    }
  });
});

describe('resolveHeading - Not found', () => {
  test('completely unrelated string', () => {
    const result = resolveHeading('XYZ_NONEXISTENT_HEADING_AAAAA', headings);
    expect(result.type).toBe('not-found');
  });
});

describe('resolveHeading - Ambiguity', () => {
  test('duplicate headings cause ambiguity', () => {
    const dupes: Heading[] = [
      { text: 'Section', id: 'section-1', level: 2 },
      { text: 'Section', id: 'section-2', level: 2 },
    ];
    const result = resolveHeading('Section', dupes);
    expect(result.type).toBe('ambiguous');
  });
});

describe('Bulleted Item Headings', () => {
  test('extractHeadings and slug generation for bulleted item headings', () => {
    const itemHeadings: Heading[] = [
      { text: 'Romanism', id: 'romanism', level: 4 },
      { text: 'Liquidation', id: 'liquidation', level: 4 },
    ];
    const res = resolveHeading('Romanism', itemHeadings);
    expect(res.type).toBe('match');
    if (res.type === 'match') {
      expect(res.heading.id).toBe('romanism');
    }
  });
});
