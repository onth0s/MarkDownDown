import { mirrorParse, resetMirrorIdCounter } from '../src/renderer/mirror/parse.js';

describe('mirrorParse: Q&A and FAQ', () => {
  beforeEach(() => {
    resetMirrorIdCounter();
  });

  test('parses a basic Q&A block', () => {
    const source = `
TITLE: Core Concepts Q&A
Q: What is Mirror Mode?
A: A reader-side semantic audit layer.
`;
    const model = mirrorParse(source, 'qa');
    expect(model.kind).toBe('qa');
    expect(model.title).toBe('Core Concepts Q&A');
    expect(model.items).toHaveLength(1);
    expect(model.items[0].question).toBe('What is Mirror Mode?');
    expect(model.items[0].answer).toBe('A reader-side semantic audit layer.');
    expect(model.probes).toHaveLength(0);
  });

  test('parses multiple Q&A items with subkind faq', () => {
    const source = `
Q: First Question?
A: First Answer.

Q: Second Question?
A: Second Answer.
`;
    const model = mirrorParse(source, 'faq');
    expect(model.kind).toBe('faq');
    expect(model.items).toHaveLength(2);
    expect(model.items[0].question).toBe('First Question?');
    expect(model.items[1].question).toBe('Second Question?');
  });

  test('infers qa kind automatically when Q: is present without subkind hint', () => {
    const source = `
Q: Auto-inferred question?
A: Auto-inferred answer.
`;
    const model = mirrorParse(source);
    expect(model.kind).toBe('qa');
    expect(model.items).toHaveLength(1);
  });
});

describe('mirrorParse: Alignment Probes', () => {
  beforeEach(() => {
    resetMirrorIdCounter();
  });

  test('parses structured semantic alignment probe with options and divergence', () => {
    const source = `
TITLE: Dual-Mode Conception
TARGET: architecture
PROBE: What constitutes a successful reader engagement in Mirror Mode?
[ ] Achieving 100% agreement on all propositions.
[x] Accurate reconstruction of the author's declared distinction --> Understanding is distinct from agreement.
[ ] Automatic test generation.

AUTHOR: The author distinguishes understanding from agreement.
DIVERGENCE: Collapsing auditing into compliance testing is an ideological error.
`;
    const model = mirrorParse(source, 'probe');
    expect(model.kind).toBe('probe');
    expect(model.title).toBe('Dual-Mode Conception');
    expect(model.target).toBe('architecture');
    expect(model.probes).toHaveLength(1);

    const probe = model.probes[0];
    expect(probe.claim).toBe('What constitutes a successful reader engagement in Mirror Mode?');
    expect(probe.options).toHaveLength(3);
    expect(probe.options[0].isAuthorAligned).toBe(false);
    expect(probe.options[0].text).toBe('Achieving 100% agreement on all propositions.');
    expect(probe.options[1].isAuthorAligned).toBe(true);
    expect(probe.options[1].text).toBe("Accurate reconstruction of the author's declared distinction");
    expect(probe.options[1].explanation).toBe('Understanding is distinct from agreement.');
    expect(probe.authorDeclaredMeaning).toBe('The author distinguishes understanding from agreement.');
    expect(probe.divergenceExplanation).toBe('Collapsing auditing into compliance testing is an ideological error.');
  });

  test('infers probe kind automatically when PROBE: is present', () => {
    const source = `
PROBE: Is this a probe?
[x] Yes
[ ] No
AUTHOR: It is indeed a probe.
`;
    const model = mirrorParse(source);
    expect(model.kind).toBe('probe');
    expect(model.probes).toHaveLength(1);
    expect(model.probes[0].options[0].isAuthorAligned).toBe(true);
  });

  test('accepts synonym keywords for author meaning and divergence', () => {
    const source = `
PROBE: Verification of synonym support
[x] Supported
[ ] Unsupported
MEANING: Synonyms such as MEANING: and GAP: work.
GAP: Divergence synonyms work reliably.
`;
    const model = mirrorParse(source, 'probe');
    expect(model.probes[0].authorDeclaredMeaning).toContain('Synonyms such as MEANING:');
    expect(model.probes[0].divergenceExplanation).toContain('Divergence synonyms work reliably.');
  });
});

describe('mirrorParse: Resilience & Edge Cases', () => {
  beforeEach(() => {
    resetMirrorIdCounter();
  });

  test('generates sequential unique IDs across blocks', () => {
    const m1 = mirrorParse('Q: One?\nA: 1.', 'qa');
    const m2 = mirrorParse('Q: Two?\nA: 2.', 'qa');
    expect(m1.id).toBe('mirror-1');
    expect(m2.id).toBe('mirror-2');
  });

  test('handles empty or whitespace-only input safely', () => {
    const model = mirrorParse('   \n\n  ');
    expect(model.kind).toBe('generic');
    expect(model.items).toHaveLength(0);
    expect(model.probes).toHaveLength(0);
  });

  test('handles multiline question and answer bodies', () => {
    const source = `
Q: How does the parser handle
   a question spanning multiple lines?
A: It concatenates continuing lines
   into the answer body smoothly.
`;
    const model = mirrorParse(source, 'qa');
    expect(model.items).toHaveLength(1);
    expect(model.items[0].question).toContain('spanning multiple lines');
    expect(model.items[0].answer).toContain('into the answer body smoothly');
  });
});
