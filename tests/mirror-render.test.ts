import { mirrorParse, resetMirrorIdCounter } from '../src/renderer/mirror/parse.js';
import { mirrorBuildHtml } from '../src/renderer/mirror/html.js';
import { injectMirrorBlocks } from '../src/pipeline/inject-mirror.js';

describe('mirrorBuildHtml', () => {
  beforeEach(() => {
    resetMirrorIdCounter();
  });

  test('renders complete mirror block structure with pill and card', () => {
    const source = `
TITLE: Core QA
Q: What is MD++?
A: An extended markdown compiler.
`;
    const model = mirrorParse(source, 'qa');
    const html = mirrorBuildHtml(model, 'Test Document');

    expect(html).toContain('class="mirror-block"');
    expect(html).toContain('data-mirror-id="mirror-1"');
    expect(html).toContain('data-kind="qa"');
    expect(html).toContain('data-count="1"');
    expect(html).toContain('class="mirror-margin-pill"');
    expect(html).toContain('🪞');
    expect(html).toContain('1 item');
    expect(html).toContain('class="mirror-card"');
    expect(html).toContain('class="mirror-card-close-btn"');
    expect(html).toContain('class="mirror-qa-card"');
    expect(html).toContain('class="mirror-reader-section"');
  });

  test('renders alignment probe with radio options, eval button, and audit actions', () => {
    const source = `
TITLE: Architectural Premise
PROBE: Does understanding equal agreement?
[ ] Yes, if you understand you agree.
[x] No, understanding is independent of agreement.
AUTHOR: The author separates comprehension from assent.
DIVERGENCE: Conflating the two prevents objective audit.
`;
    const model = mirrorParse(source, 'probe');
    const html = mirrorBuildHtml(model);

    expect(html).toContain('class="mirror-probe-card"');
    expect(html).toContain('data-probe-id="mirror-1-p0"');
    expect(html).toContain('class="mirror-probe-claim"');
    expect(html).toContain('Does understanding equal agreement?');
    expect(html).toContain('type="radio"');
    expect(html).toContain('data-aligned="true"');
    expect(html).toContain('data-aligned="false"');
    expect(html).toContain('class="mirror-eval-btn"');
    expect(html).toContain("Compare with Author's Meaning");
    expect(html).toContain('class="mirror-probe-reveal"');
    expect(html).toContain('The author separates comprehension from assent.');
    expect(html).toContain('Conflating the two prevents objective audit.');
    expect(html).toContain('data-action="understood"');
    expect(html).toContain('data-action="disagree"');
  });
});

describe('injectMirrorBlocks pipeline stage', () => {
  beforeEach(() => {
    resetMirrorIdCounter();
  });

  test('replaces code-wrap mirror blocks and accumulates mirror stats', () => {
    const rawHtml = `
<p>Introductory paragraph.</p>
<div class="code-wrap mirror" data-kind="mirror" data-subkind="qa">
<pre><code class="language-mirror" data-subkind="qa">Q: Test Question?
A: Test Answer.
</code></pre>
<div class="mirror-render"></div>
</div>
<p>Concluding paragraph.</p>
`;
    const { html, stats } = injectMirrorBlocks(rawHtml, 'Test Doc');

    expect(html).toContain('<div class="code-wrap mirror"');
    expect(html).toContain('<div class="mirror-render"><aside class="mirror-block"');
    expect(html).toContain('Test Question?');
    expect(stats.blocks).toBe(1);
    expect(stats.items).toBe(1);
    expect(stats.probes).toBe(0);
  });
});
