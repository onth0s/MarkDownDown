import { assembleHtml } from '../src/renderer/template.js';

describe('assembleHtml', () => {
  const baseOpts = {
    title: 'Test Title',
    metaDescription: 'Test Title',
    css: ':root { --accent: #3b82f6; }',
    js: '(() => { console.log("test"); })();',
    body: '<h1 id="hello">Hello</h1>',
    outputMode: 'single' as const,
  };

  test('single mode inlines CSS and JS', () => {
    const html = assembleHtml(baseOpts);
    expect(html).toContain('<style>:root { --accent: #3b82f6; }</style>');
    expect(html).toContain('<script>(() => { console.log("test"); })();</script>');
    expect(html).not.toContain('link rel="stylesheet"');
    expect(html).not.toContain('script src=');
  });

  test('split mode links CSS and JS', () => {
    const html = assembleHtml({ ...baseOpts, outputMode: 'split' });
    expect(html).toContain('<link rel="stylesheet" href="style.css">');
    expect(html).toContain('<script src="app.js"></script>');
    expect(html).not.toContain('<style>');
    expect(html).not.toContain('<script>((');
  });

  test('injects title', () => {
    const html = assembleHtml(baseOpts);
    expect(html).toContain('<title>Test Title</title>');
  });

  test('injects body', () => {
    const html = assembleHtml(baseOpts);
    expect(html).toContain('<h1 id="hello">Hello</h1>');
  });

  test('injects hero when provided', () => {
    const html = assembleHtml({
      ...baseOpts,
      hero: '<section class="hero"><h1>Hero</h1></section>',
    });
    expect(html).toContain('<section class="hero"><h1>Hero</h1></section>');
  });

  test('no hero when omitted', () => {
    const html = assembleHtml(baseOpts);
    expect(html).not.toContain('class="hero"');
  });

  test('single mode includes custom CSS', () => {
    const html = assembleHtml({
      ...baseOpts,
      customCss: '.custom { color: red; }',
    });
    expect(html).toContain('.custom { color: red; }');
  });

  test('split mode includes custom CSS in style.css link context', () => {
    const html = assembleHtml({
      ...baseOpts,
      outputMode: 'split',
      customCss: '.custom { color: red; }',
    });
    // In split mode, custom CSS is NOT inlined in HTML
    expect(html).not.toContain('.custom { color: red; }');
  });

  test('escapes title in HTML attributes', () => {
    const html = assembleHtml({
      ...baseOpts,
      title: 'Tom & Jerry "Show"',
    });
    expect(html).toContain('<title>Tom &amp; Jerry &quot;Show&quot;</title>');
  });
});
