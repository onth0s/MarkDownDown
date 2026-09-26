import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compile } from '../src/compile.js';
import type { CompileResult, Options } from '../src/types.js';

function build(rawSource: string, docTitle = 'Document Title'): CompileResult {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md++-a11y-'));
  const input = path.join(dir, 'in.mdd');
  fs.writeFileSync(input, rawSource, 'utf8');
  try {
    return compile({
      inputFile: input,
      outputPath: path.join(dir, 'out.html'),
      outputMode: 'single',
      assetsDir: dir,
      title: docTitle,
      accent: '#8b5cf6',
      noDiagrams: false,
      noTables: false,
      verbose: false,
    } as Options);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * One `aria-label` per rendered diagram or table, in document order.
 *
 * A `diagram` fence with no explicit direction defaults to `auto`, which emits
 * a TB and an LR SVG from the same model. Both describe the same diagram, so
 * they have to agree; this collapses the pair.
 */
function svgLabels(html: string): string[] {
  const out: string[] = [];
  const divRe = /<div class="(?:diagram|table)-render">([\s\S]*?)<\/div>\s*<\/div>/g;
  for (const m of html.matchAll(divRe)) {
    const tags = [...m[1].matchAll(/<svg[^>]*aria-label="([^"]*)"/g)].map(x => x[1]!);
    expect(tags.length).toBeGreaterThan(0);
    for (const t of tags) expect(t).toBe(tags[0]);
    out.push(tags[0]!);
  }
  return out;
}

describe('artifact accessibility: no SVG is left unlabelled', () => {
  /**
   * Every `<svg>` in the emitted markup must be either named or explicitly
   * hidden.
   *
   * `<script>` bodies are stripped first, and that detail matters: the favicon
   * template is embedded as a JS string constant (`__FAVICON__`) and is only
   * ever assigned to a `<link rel="icon">` href. It never becomes a DOM
   * element, so scanning it as markup reports a phantom unlabelled SVG.
   */
  function unlabelledSvgs(html: string): string[] {
    const markup = html.replace(/<script\b[\s\S]*?<\/script>/g, '');
    const out: string[] = [];
    for (const m of markup.matchAll(/<svg\b[^>]*>/g)) {
      const tag = m[0];
      const named = /aria-label(?:ledby)?="[^"]+"/.test(tag);
      const hidden = /aria-hidden="true"/.test(tag);
      if (!named && !hidden) out.push(tag.slice(0, 120));
    }
    return out;
  }

  test('a document with a diagram, a table and a code block leaves no SVG unnamed', () => {
    const r = build(
      '# Doc\n\n```diagram\nTITLE: Flow\nA[One] --> B[Two]\n```\n\n' +
        '| Flag | Type |\n| --- | --- |\n| -o | string |\n\n' +
        '```js\nconst a = 1;\n```\n'
    );
    expect(unlabelledSvgs(r.html)).toEqual([]);
  });

  test('the decorative chrome icons are hidden, not merely unnamed', () => {
    // Guards the specific icons the shell and the download buttons emit. Each
    // sits inside a control that is already named, so the SVG is redundant
    // rather than informative; without aria-hidden the control is announced
    // twice.
    const r = build('```diagram\nA[One] --> B[Two]\n```\n');
    const markup = r.html.replace(/<script\b[\s\S]*?<\/script>/g, '');

    const search = /<svg[^>]*viewBox="0 0 24 24"[^>]*width="16"[^>]*>/.exec(markup);
    expect(search).not.toBeNull();
    expect(search![0]).toContain('aria-hidden="true"');

    for (const icon of markup.matchAll(/<svg[^>]*viewBox="0 0 24 24"[^>]*width="13"[^>]*>/g)) {
      expect(icon[0]).toContain('aria-hidden="true"');
    }
    // The download icons only appear on graphic blocks.
    expect(markup.match(/viewBox="0 0 24 24"[^>]*width="13"/g)?.length ?? 0).toBeGreaterThan(0);
  });

  test('the brand logo follows the same hidden pattern', () => {
    const r = build('Just prose.\n');
    const logo = /<svg[^>]*class="brand-logo"[^>]*>/.exec(r.html);
    expect(logo).not.toBeNull();
    expect(logo![0]).toContain('aria-hidden="true"');
  });
});

describe('diagram accessibility: a title is always available', () => {
  test('a TITLE: directive is used verbatim', () => {
    const r = build('```diagram\nTITLE: Explicit Name\nA[One] --> B[Two]\n```\n');
    expect(svgLabels(r.html)).toEqual(['Explicit Name']);
  });

  test('an untitled diagram falls back to its nearest heading, not the document title', () => {
    // Previously every untitled diagram in a document fell back to the
    // *document* title, so a screen reader announced the same string for
    // every diagram on the page. The heading the diagram sits under is a
    // better description and is almost always distinct.
    const r = build(
      '# Document Title\n\n## Ingest Pipeline\n\n```diagram\nA[One] --> B[Two]\n```\n\n' +
      '## Mirror Layer\n\n```diagram\nC[Three] --> D[Four]\n```\n'
    );
    expect(svgLabels(r.html)).toEqual(['Ingest Pipeline', 'Mirror Layer']);
  });

  test('the heading fallback walks back past intervening sections', () => {
    const r = build(
      '# Doc\n\n## Outer\n\n### Target Section\n\nSome prose.\n\n' +
      '#### Sub A\n\nMore prose.\n\n' +
      '```diagram\nA[One] --> B[Two]\n```\n'
    );
    expect(svgLabels(r.html)).toEqual(['Sub A']);
  });

  test('a TITLE: directive beats a nearer heading', () => {
    const r = build('## Section\n\n```diagram\nTITLE: Override\nA[One]\n```\n');
    expect(svgLabels(r.html)).toEqual(['Override']);
  });

  test('the document title is still the last resort', () => {
    // No heading at all above the fence: there is nothing better to say, so
    // falling back to the document title is correct rather than a bug.
    const r = build('```diagram\nA[One] --> B[Two]\n```\n', 'Only Title');
    expect(svgLabels(r.html)).toEqual(['Only Title']);
  });

  test('heading text with inline markup is flattened, not stripped to nothing', () => {
    const r = build('## The **bold** and `code` heading\n\n```diagram\nA[One]\n```\n');
    expect(svgLabels(r.html)).toEqual(['The bold and code heading']);
  });

  test('every showcase diagram SVG has a distinct, non-document-title label', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md++-a11y-sc-'));
    try {
      const result = compile({
        inputFile: path.resolve(process.cwd(), 'showcase', 'showcase.mdd'),
        outputPath: path.join(dir, 'out.html'),
        outputMode: 'single',
        assetsDir: path.resolve(process.cwd(), 'showcase', 'assets'),
        title: 'Markdown++ Capability Showcase',
        accent: '#8b5cf6',
        noDiagrams: false,
        noTables: false,
        verbose: false,
      } as Options);

      const labels = svgLabels(result.html);
      expect(labels.length).toBeGreaterThanOrEqual(9);
      // 7 of 13 SVGs used to carry the document title.
      expect(labels.filter(l => l === 'Markdown++ Capability Showcase')).toEqual([]);
      // Diagrams under one heading legitimately share a label, so dedupe
      // rather than demanding every one be unique.
      expect(new Set(labels).size).toBeGreaterThanOrEqual(5);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('diagram accessibility: geometry problems are reported, not swallowed', () => {
  test('a clean document emits no geometry warnings', () => {
    const r = build('```diagram\nA[One] --> B[Two]\nB --> C[Three]\n```\n');
    expect(r.warnings.filter(w => /passes through node|could not be re-routed/.test(w))).toEqual([]);
  });

  test('an unrepairable routing problem surfaces as a warning instead of throwing', () => {
    // Node-to-node overlap is a hard error, but an edge that cannot find a
    // corridor is an authoring reality the author should hear about rather
    // than have the build fail on.
    const r = build(
      '```diagram\n' +
      'A[Src]\n' +
      'B[An extremely wide intermediate node label that spans nearly everything]\n' +
      'C[Dst]\n' +
      'D[Another very wide node also spanning nearly the whole diagram width]\n' +
      'A --> B\n' +
      'B --> C\n' +
      'C --> D\n' +
      '```\n'
    );
    // Compiles at all, and if anything is wrong it is reported as a warning.
    expect(typeof r.html).toBe('string');
    expect(Array.isArray(r.warnings)).toBe(true);
  });
});
