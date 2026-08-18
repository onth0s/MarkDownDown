import { escHtml, escAttr, htmlDecode } from '../src/util/escape.js';

describe('escHtml', () => {
  test('escapes ampersand', () => {
    expect(escHtml('a & b')).toBe('a &amp; b');
  });

  test('escapes angle brackets', () => {
    expect(escHtml('<script>')).toBe('&lt;script&gt;');
  });

  test('escapes double quotes', () => {
    expect(escHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  test('handles empty string', () => {
    expect(escHtml('')).toBe('');
  });

  test('handles string with no special chars', () => {
    expect(escHtml('hello world')).toBe('hello world');
  });

  test('escapes multiple special chars', () => {
    expect(escHtml('<a&b"c')).toBe('&lt;a&amp;b&quot;c');
  });
});

describe('escAttr', () => {
  test('escapes ampersand and double quotes', () => {
    expect(escAttr('a & "b"')).toBe('a &amp; &quot;b&quot;');
  });

  test('escapes angle brackets', () => {
    expect(escAttr('<div>')).toBe('&lt;div&gt;');
  });

  test('handles empty string', () => {
    expect(escAttr('')).toBe('');
  });
});

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
});
