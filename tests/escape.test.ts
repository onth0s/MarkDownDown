import { escHtml, htmlDecode } from '../src/util/escape.js';

describe('htmlDecode', () => {
  test('decodes &amp;', () => {
    expect(htmlDecode('a &amp; b')).toBe('a & b');
  });

  test('decodes &lt; and &gt;', () => {
    expect(htmlDecode('&lt;div&gt;')).toBe('<div>');
  });

  test('decodes &quot;', () => {
    expect(htmlDecode('&quot;hello&quot;')).toBe('"hello"');
  });

  test('handles empty string', () => {
    expect(htmlDecode('')).toBe('');
  });

  test('round-trips with escHtml', () => {
    const original = 'Hello <World> & "Friends"';
    expect(htmlDecode(escHtml(original))).toBe(original);
  });

  test('decodes astral plane Unicode entities (emoji, symbols)', () => {
    expect(htmlDecode('&#x1F680;')).toBe('🚀');
    expect(htmlDecode('&#128512;')).toBe('😀');
  });
});
