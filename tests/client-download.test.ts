/**
 * Exercises the SHIPPED client code in templates/app/06-download.js against a
 * minimal DOM, so the download path is verified as shipped rather than
 * reimplemented. The fake DOM implements only the subset the file touches:
 * nodeType/tagName/childNodes/classList/id, plus remove/replaceWith/normalize/
 * cloneNode/querySelectorAll — enough to model seams (<wbr>, <mark>) and chrome.
 */
import path from 'node:path';
import fs from 'node:fs';

type AnyNode = FakeEl | FakeText;

class FakeText {
  nodeType = 3;
  childNodes: AnyNode[] = [];
  parentNode: FakeEl | null = null;
  constructor(public data: string) {}
}

class FakeEl {
  nodeType = 1;
  childNodes: AnyNode[] = [];
  parentNode: FakeEl | null = null;
  classList: { contains(c: string): boolean };
  constructor(public tagName: string, public cls = '', public id = '') {
    this.classList = { contains: (c: string) => this.cls.split(/\s+/).includes(c) };
  }
  get textContent(): string {
    return this.childNodes
      .map((n) => (n instanceof FakeText ? n.data : n.textContent))
      .join('');
  }
  append(...kids: AnyNode[]): this {
    for (const k of kids) {
      k.parentNode = this;
      this.childNodes.push(k);
    }
    return this;
  }
  remove(): void {
    const p = this.parentNode;
    if (!p) return;
    const i = p.childNodes.indexOf(this);
    if (i >= 0) p.childNodes.splice(i, 1);
    this.parentNode = null;
  }
  replaceWith(...nodes: AnyNode[]): void {
    const p = this.parentNode;
    if (!p) return;
    const i = p.childNodes.indexOf(this);
    if (i < 0) return;
    for (const n of nodes) n.parentNode = p;
    p.childNodes.splice(i, 1, ...nodes);
    this.parentNode = null;
  }
  /** Real DOM normalize(): join adjacent text nodes, recursively. */
  normalize(): void {
    for (const n of this.childNodes) if (n instanceof FakeEl) n.normalize();
    const merged: AnyNode[] = [];
    for (const n of this.childNodes) {
      const last = merged[merged.length - 1];
      if (n instanceof FakeText && last instanceof FakeText) last.data += n.data;
      else merged.push(n);
    }
    this.childNodes = merged;
  }
  cloneNode(deep = false): FakeEl {
    const c = new FakeEl(this.tagName, this.cls, this.id);
    if (deep) {
      for (const n of this.childNodes) {
        c.append(n instanceof FakeEl ? n.cloneNode(true) : new FakeText(n.data));
      }
    }
    return c;
  }
  /** Descendants matching a 'tag, tag' selector (never the root itself). */
  querySelectorAll(sel: string): FakeEl[] {
    const tags = sel.split(',').map((s) => s.trim().toLowerCase());
    const out: FakeEl[] = [];
    const walk = (n: FakeEl) => {
      for (const c of n.childNodes) {
        if (c instanceof FakeEl) {
          if (tags.includes(c.tagName.toLowerCase())) out.push(c);
          walk(c);
        }
      }
    };
    walk(this);
    return out;
  }
}

const T = (data: string) => new FakeText(data);
const E = (tag: string, cls = '', ...kids: AnyNode[]) =>
  new FakeEl(tag.toUpperCase(), cls, '').append(...kids);

const PROSE = -1;

/** Article whose DOM exercises every extraction rule at once. */
function buildArticle(): FakeEl {
  return E(
    'article',
    '',
    // chrome: must never contribute a run
    E('section', 'hero', E('h1', '', T('Ignored Hero'))),
    // 02-toc.js injects this anchor into every heading at RUNTIME, so it is in
    // the live DOM and in no static HTML. Reading its "#" would add a phantom
    // run per heading and shear every later slot out of alignment.
    E('h2', '', T('Section '), E('a', 'heading-anchor', T('#'))),
    E('p', '', T('Body of that section.')),
    // prose: inline elements, an isolated whitespace run, a <wbr> seam
    E(
      'p',
      '',
      T('Hello'),
      E('em', '', T('world')),
      T(','),
      E('strong', '', T('bold')),
      T(' '),
      E('code', '', T('c')),
      T('d'),
      E('wbr'),
    ),
    // prose: <br> swallows the following whitespace-only node
    E('p', '', T('line1'), E('br'), T('\n'), T('line2')),
    // prose: <mark> seam (as search highlighting leaves it) re-joins its run
    E('p', '', T('do'), E('mark', '', T('c')), T('s')),
    // more chrome
    E('pre', '', E('code', '', T('fence()'))),
    E('div', 'code-title-bar', T('diagram')),
    E('div', 'code-actions', T('save svg')),
    E('aside', 'mirror-block', T('mirror prose')),
    E('div', 'alert-title', T('NOTE')),
    E('div', 'no-results', T('nothing found')),
    E('button', '', T('Copy')),
    E('svg', '', T('svg label')),
  );
}

const FM = '---\ntitle: Fake Doc\n---\n';

/** Skeleton: 12 PROSE slots, with only slot 11 (the <mark> run) overridden. */
const SKELETON = {
  v: 1 as const,
  fm: FM,
  b: [
    '## ', PROSE, '\n\n', PROSE, '\n\nParagraph ', PROSE, ' and ', PROSE, '.\n\n',
    PROSE, ' ', PROSE, 'd ', PROSE, '.\n\n', PROSE, ' br ', PROSE, '.\n\nSplit ',
    PROSE, '.\n\n', PROSE, '.\n\n', PROSE, '.\n',
  ],
  eol: '\n' as const,
  spans: { 11: 'documents' },
};

const EXPECTED_RUNS = [
  'Section ', 'Body of that section.',
  'Hello', 'world', ',', 'bold', ' ', 'c', 'd', 'line1', 'line2', 'docs',
];

// Assembled strictly from the run list above, through the skeleton's literals.
const EXPECTED_SOURCE =
  FM +
  '## ' + 'Section ' +
  '\n\n' + 'Body of that section.' +
  '\n\nParagraph ' + 'Hello' +
  ' and ' + 'world' +
  '.\n\n' + ',' +
  ' ' + 'bold' +
  'd ' + ' ' +
  '.\n\n' + 'c' +
  ' br ' + 'd' +
  '.\n\nSplit ' + 'line1' +
  '.\n\n' + 'line2' +
  '.\n\n' + 'documents' +
  '.\n';

const CLIENT_SRC = fs.readFileSync(
  path.resolve(process.cwd(), 'templates', 'app', '06-download.js'),
  'utf8',
);

interface Harness {
  /** Invoke the registered contextmenu handler; returns the downloaded bytes. */
  fire: () => Promise<{ filename: string; text: string; prevented: boolean }>;
  registered: number;
}

/**
 * Load the shipped client file with a fake document, then trigger the download.
 * `payload` is the JSON embedded in #mdd-skeleton (null = tag absent).
 */
function runClient(payload: unknown, article: FakeEl | null): Harness {
  type CtxHandler = (ev: { preventDefault(): void }) => void;
  const handlers: CtxHandler[] = [];
  const brand = new FakeEl('DIV', 'brand') as FakeEl & {
    addEventListener: (type: string, fn: CtxHandler) => void;
  };
  brand.addEventListener = (type, fn) => {
    if (type === 'contextmenu') handlers.push(fn);
  };

  const skeletonEl = new FakeEl('SCRIPT');
  if (payload !== null) skeletonEl.append(T(JSON.stringify(payload)));

  interface FakeAnchor {
    href: string;
    download: string;
    clicked: boolean;
    removed: boolean;
    click(): void;
    remove(): void;
  }
  const anchor: FakeAnchor = {
    href: '', download: '', clicked: false, removed: false,
    click() { this.clicked = true; },
    remove() { this.removed = true; },
  };
  const doc = {
    getElementById(id: string) {
      if (id === 'mdd-skeleton') return payload === null ? null : skeletonEl;
      if (id === 'article') return article;
      return null;
    },
    querySelector(sel: string) { return sel === '.brand' ? brand : null; },
    createElement(tag: string) { return tag === 'a' ? anchor : null; },
    body: { appendChild() { return undefined; } },
  };

  let blob: Blob | null = null;
  const urlStub = {
    createObjectURL(b: Blob) { blob = b; return 'blob:fake'; },
    revokeObjectURL() { /* no-op */ },
  };

  // The client file is a plain script, not a module: evaluate it as a function
  // body with the browser globals it touches supplied as parameters.
  new Function('document', 'Blob', 'URL', 'setTimeout', CLIENT_SRC)(
    doc, Blob, urlStub, () => undefined,
  );

  return {
    registered: handlers.length,
    fire: async () => {
      let prevented = false;
      handlers[0]?.({ preventDefault: () => { prevented = true; } });
      const text = blob ? await blob.text() : '';
      return { filename: anchor.download, text, prevented };
    },
  };
}

describe('06-download.js (shipped client): right-click the logo downloads the source', () => {
  test('registers a contextmenu handler on .brand only when a payload exists', () => {
    expect(runClient({ name: 'fake.mdd', skeleton: SKELETON }, buildArticle()).registered).toBe(1);
    // No payload, no handler: a build without a skeleton is inert.
    expect(runClient(null, buildArticle()).registered).toBe(0);
  });

  test('suppresses the native context menu and emits the exact source bytes', async () => {
    const h = runClient({ name: 'fake.mdd', skeleton: SKELETON }, buildArticle());
    const { filename, text, prevented } = await h.fire();
    expect(prevented).toBe(true);
    expect(filename).toBe('fake.mdd');
    expect(text).toBe(EXPECTED_SOURCE);
  });

  test('the walk keeps exactly the runs the extractor expects (chrome dropped)', async () => {
    // A skeleton of pure PROSE slots separated by a delimiter: the assembly then
    // reads back as the run list verbatim, which pins slot/run alignment and
    // proves chrome (hero, pre, mirror, alert-title, svg, button, title bar)
    // contributed nothing.
    const runsSkeleton = {
      v: 1 as const, fm: '', eol: '\n' as const, spans: undefined,
      b: EXPECTED_RUNS.flatMap(() => [PROSE, '<']),
    };
    const h = runClient({ name: 'fake.mdd', skeleton: runsSkeleton }, buildArticle());
    const { text } = await h.fire();
    expect(text).toBe(EXPECTED_RUNS.join('<') + '<');
    // Sanity: none of the chrome text leaked into a run.
    for (const chrome of ['Ignored Hero', 'fence()', 'mirror prose', 'svg label', 'Copy']) {
      expect(text).not.toContain(chrome);
    }
  });

  test('a search <mark> split does not skew alignment when many slots follow', async () => {
    // Same article, but the skeleton expects the mark run to have rejoined, and
    // every later slot must still line up (the fidelity override is slot 11).
    const h = runClient({ name: 'fake.mdd', skeleton: SKELETON }, buildArticle());
    const { text } = await h.fire();
    expect(text).toBe(EXPECTED_SOURCE);
    // The pruned span (slot 11) wins over the DOM's rejoined "docs" run.
    expect(text).toContain('\n\ndocuments.\n');
    expect(text).not.toContain('docs');
  });

  test('no article or no handler fails silently without throwing', async () => {
    const noArticle = runClient({ name: 'fake.mdd', skeleton: SKELETON }, null);
    expect(noArticle.registered).toBe(0);
  });

  test('a runtime-injected heading anchor is chrome, whatever its text', async () => {
    // 02-toc.js appends `<a class="heading-anchor">#</a>` to every heading after
    // load, and swaps that text to "Link copied!" when clicked. Neither string
    // is in the static HTML the skeleton was built from, so reading either one
    // shears every later slot out of alignment. The download must be identical
    // before and after the mutation.
    const article = buildArticle();
    const before = (await runClient({ name: 'fake.mdd', skeleton: SKELETON }, article).fire()).text;

    for (const anchor of article.querySelectorAll('a')) {
      if (!anchor.classList.contains('heading-anchor')) continue;
      const textNode = anchor.childNodes[0];
      if (!(textNode instanceof FakeText)) throw new Error('anchor should hold one text node');
      for (const text of ['#', 'Link copied!', 'Copy failed']) {
        textNode.data = text;
        const after = (await runClient({ name: 'fake.mdd', skeleton: SKELETON }, article).fire()).text;
        expect(after).toBe(before);
      }
    }
    // And the anchor's text is genuinely absent from the reconstruction.
    expect(before).toBe(EXPECTED_SOURCE);
    expect(before).not.toContain('Link copied!');
  });
});
