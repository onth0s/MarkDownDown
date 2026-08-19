import { wrapCodeBlocksWithCopyButtons, validateNoNestedCodeWraps } from '../src/pipeline/copy-buttons.js';

describe('wrapCodeBlocksWithCopyButtons & validation', () => {
  test('wraps plain pre/code block with .code-wrap and copy button', () => {
    const input = '<pre><code class="language-js">console.log("hi");</code></pre>';
    const output = wrapCodeBlocksWithCopyButtons(input);
    expect(output).toContain('<div class="code-wrap">');
    expect(output).toContain('<button class="copy-btn"');
    expect(output).toContain(input);
  });

  test('adds copy button and download actions to diagram/table wrapper', () => {
    const input = '<div class="code-wrap diagram" data-title="My Diagram"><pre><code class="language-diagram">A --> B</code></pre><div class="diagram-render"></div></div>';
    const output = wrapCodeBlocksWithCopyButtons(input);
    expect(output).toContain('class="code-title-bar"');
    expect(output).toContain('My Diagram');
    expect(output).toContain('class="download-btn"');
  });

  test('validateNoNestedCodeWraps throws on illegally nested .code-wrap elements', () => {
    const invalidHtml = '<div class="code-wrap"><div class="code-wrap"><pre><code>test</code></pre></div></div>';
    expect(() => validateNoNestedCodeWraps(invalidHtml)).toThrow('illegally nested .code-wrap');
  });

  test('validateNoNestedCodeWraps passes on valid non-nested structure', () => {
    const validHtml = '<div class="code-wrap"><pre><code>test 1</code></pre></div><div class="code-wrap"><pre><code>test 2</code></pre></div>';
    expect(() => validateNoNestedCodeWraps(validHtml)).not.toThrow();
  });
});
