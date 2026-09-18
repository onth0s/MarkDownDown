import { compile } from '../src/compile.js';
import { createMarkdownParser } from '../src/parser/markdown.js';
import { extractHeadings } from '../src/resolver/heading.js';
import type { Options } from '../src/types.js';

describe('Headings with Wikilinks', () => {
  test('generates proper IDs for pure wikilink headings', () => {
    const md = createMarkdownParser();
    const source = '## [[Spite-Driven Development]]\n\nSome text.';
    const tokens = md.parse(source, {});
    const headings = extractHeadings(tokens);

    expect(headings).toHaveLength(1);
    expect(headings[0].text).toBe('Spite-Driven Development');
    expect(headings[0].id).toBe('spite-driven-development');
    expect(headings[0].level).toBe(2);
  });

  test('generates proper IDs for aliased wikilink headings', () => {
    const md = createMarkdownParser();
    const source = '## First Principle: The [[Bicycle for the Mind|Bicycle]]';
    const tokens = md.parse(source, {});
    const headings = extractHeadings(tokens);

    expect(headings).toHaveLength(1);
    expect(headings[0].text).toBe('First Principle: The Bicycle');
    expect(headings[0].id).toBe('first-principle-the-bicycle');
  });

  test('generates proper IDs and item-heading class for bulleted wikilink headings', () => {
    const md = createMarkdownParser();
    const source = '### * The [[Separation of Code and Rent]]';
    const tokens = md.parse(source, {});
    const headings = extractHeadings(tokens);

    expect(headings).toHaveLength(1);
    expect(headings[0].text).toBe('The Separation of Code and Rent');
    expect(headings[0].id).toBe('the-separation-of-code-and-rent');
  });

  test('compiles full document with wikilink headings and fragment identifiers', () => {
    const mdd = `---
title: "Test Doc"
accent: "#f97316"
---

# PART I

## [[Spite-Driven Development]]

See [[Spite-Driven Development]] for details.
`;

    const options: Options = {
      inputFile: 'test.mdd',
      rawSource: mdd,
      outputPath: 'test.html',
      outputMode: 'single',
      accent: '#f97316',
      assetsDir: './assets',
      title: 'Test Doc',
      noDiagrams: false,
      noTables: false,
      verbose: false,
    };

    const res = compile(options);
    expect(res.html).toContain('id="spite-driven-development"');
    expect(res.html).toContain('href="#spite-driven-development"');
    expect(res.stats?.sections).toBe(2);
  });

  test('normalizes diacritics in heading slugs without breaking latin characters', () => {
    const md = createMarkdownParser();
    const source = '## Café & Résumé über Größe\n\nSome text.';
    const tokens = md.parse(source, {});
    const headings = extractHeadings(tokens);

    expect(headings).toHaveLength(1);
    expect(headings[0].id).toBe('cafe-resume-uber-grosse');
  });

  test('disambiguates duplicate heading anchors deterministically', () => {
    const md = createMarkdownParser();
    const source = '## Introduction\n\n## Introduction\n\n## Introduction';
    const tokens = md.parse(source, {});
    const headings = extractHeadings(tokens);

    expect(headings).toHaveLength(3);
    expect(headings[0].id).toBe('introduction');
    expect(headings[1].id).toBe('introduction-1');
    expect(headings[2].id).toBe('introduction-2');
  });
});
