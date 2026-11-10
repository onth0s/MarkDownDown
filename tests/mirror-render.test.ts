import { mirrorParse } from '../src/renderer/mirror/parse.js';
import { mirrorBuildHtml } from '../src/renderer/mirror/html.js';
import { injectMirrorBlocks } from '../src/pipeline/inject-mirror.js';

describe('mirrorBuildHtml', () => {

  test('renders complete mirror block structure with pill and card', () => {
    const source = `
TITLE: Core QA
Q: What is MD++?
A: An extended markdown compiler.
`;
    const model = mirrorParse(source, 'qa');
    const html = mirrorBuildHtml(model, 'Test Document');

    expect(html).toContain('class="mirror-block"');
    expect(html).toContain(`data-mirror-id="${model.id}"`);
    expect(html).toContain('data-kind="qa"');
    expect(html).toContain('data-count="1"');
    expect(html).toContain('class="mirror-margin-pill"');
    expect(html).toContain('class="mirror-icon-svg"');
    expect(html).toContain('1 item');
    expect(html).toContain('class="mirror-card"');
    expect(html).toContain('class="mirror-card-close-btn"');
    expect(html).toContain('class="mirror-qa-card"');
    expect(html).toContain('class="mirror-reader-section"');
  });

  test('renders alignment probe with radio options, eval button, and 3-way audit actions', () => {
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
    expect(html).toContain(`data-probe-id="${model.id}-p0"`);
    expect(html).toContain('class="mirror-probe-claim"');
    expect(html).toContain('Does understanding equal agreement?');
    expect(html).toContain('type="radio"');
    expect(html).toContain('data-aligned="true"');
    expect(html).toContain('data-aligned="false"');
    expect(html).toContain('class="mirror-eval-btn"');
    expect(html).toContain("Compare with Author's Meaning");
    expect(html).toContain('class="mirror-probe-reveal"');
    expect(html).toContain('class="mirror-probe-outcome"');
    expect(html).toContain('The author separates comprehension from assent.');
    expect(html).toContain('Conflating the two prevents objective audit.');
    expect(html).toContain('data-action="understood"');
    expect(html).toContain('data-action="misread"');
    expect(html).toContain('data-action="disagree"');
  });

  test('supports inline markdown formatter across QA and probes', () => {
    const source = `
TITLE: Markdown Formatting
Q: What about **bold** text?
A: Code like \`sample()\` is supported.
PROBE: Check *italic* claims?
[x] Option with \`code\` --> Explanation with **bold**
AUTHOR: Declared *meaning*.
`;
    const model = mirrorParse(source, 'probe');
    // Simple custom inline renderer mock to prove renderInline pipeline integration
    const mockRenderer = (text: string) => text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/`(.*?)`/g, '<code>$1</code>');
    const html = mirrorBuildHtml(model, 'Test', mockRenderer);

    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<code>sample()</code>');
    expect(html).toContain('<code>code</code>');
  });
});

describe('injectMirrorBlocks pipeline stage', () => {

  test('replaces code-wrap mirror blocks and accumulates mirror stats with stable hash IDs', () => {
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
    expect(html).toMatch(/data-mirror-id="mirror-[0-9a-f]{8}"/);
    expect(html).toContain('Test Question?');
    expect(stats.blocks).toBe(1);
    expect(stats.items).toBe(1);
    expect(stats.probes).toBe(0);
  });
  test('resolves TARGET directive against headings and injects anchor dot and locator link', () => {
    const rawHtml = `
<h2 id="core-architecture">Core Architecture</h2>
<p>Introductory paragraph.</p>
<div class="code-wrap mirror" data-kind="mirror" data-subkind="probe">
<pre><code class="language-mirror" data-subkind="probe">TITLE: Architecture Audit
TARGET: [[Core Architecture]]
PROBE: Is architecture modular?
[x] Yes
[ ] No
AUTHOR: Yes, it is modular.
</code></pre>
<div class="mirror-render"></div>
</div>
`;
    const warnings: string[] = [];
    const { html, stats } = injectMirrorBlocks(rawHtml, 'Test Doc', warnings);

    expect(warnings).toHaveLength(0);
    expect(stats.probes).toBe(1);
    // Heading should have received subtle gutter dot
    expect(html).toContain('class="mirror-anchor-dot"');
    expect(html).toContain('data-mirror-target="mirror-');
    // Mirror card should have received target locator jump button
    expect(html).toContain('class="mirror-target-locator"');
    expect(html).toContain('data-target-id="core-architecture"');
    expect(html).toContain('#core-architecture');
  });

  test('emits warning when TARGET cannot be resolved to any heading', () => {
    const rawHtml = `
<h2 id="welcome">Welcome</h2>
<div class="code-wrap mirror" data-kind="mirror" data-subkind="probe">
<pre><code class="language-mirror" data-subkind="probe">TITLE: Unresolved Audit
TARGET: [[Nonexistent Section]]
PROBE: Valid probe?
[x] Yes
AUTHOR: Yes.
</code></pre>
<div class="mirror-render"></div>
</div>
`;
    const warnings: string[] = [];
    injectMirrorBlocks(rawHtml, 'Test Doc', warnings);

    expect(warnings.some((w) => w.includes('TARGET "[[Nonexistent Section]]" could not be resolved'))).toBe(true);
  });
});
