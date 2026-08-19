import { parseFrontmatter } from '../src/parser/frontmatter.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'md++-fm-'));
}

describe('parseFrontmatter', () => {
  test('returns body unchanged when no frontmatter', () => {
    const source = '# Hello\n\nWorld.';
    const result = parseFrontmatter(source, '/tmp');
    expect(result.meta).toEqual({});
    expect(result.body).toBe(source);
  });

  test('parses valid YAML frontmatter', () => {
    const source = '---\ntitle: "My Doc"\naccent: "#ff0000"\n---\n# Body';
    const result = parseFrontmatter(source, '/tmp');
    expect(result.meta.title).toBe('My Doc');
    expect(result.meta.accent).toBe('#ff0000');
    expect(result.body).toBe('# Body');
  });

  test('resolves assets_dir relative to inputDir', () => {
    const dir = makeTmpDir();
    const source = '---\nassets_dir: ./my-assets\n---\n\nBody';
    const result = parseFrontmatter(source, dir);
    expect(result.meta.assetsDir).toBe(path.join(dir, 'my-assets'));
    fs.rmSync(dir, { recursive: true });
  });

  test('resolves custom_css relative to inputDir', () => {
    const dir = makeTmpDir();
    const source = '---\ncustom_css: ./extras.css\n---\n\nBody';
    const result = parseFrontmatter(source, dir);
    expect(result.meta.customCss).toBe(path.join(dir, 'extras.css'));
    fs.rmSync(dir, { recursive: true });
  });

  test('resolves custom_js relative to inputDir', () => {
    const dir = makeTmpDir();
    const source = '---\ncustom_js: ./extras.js\n---\n\nBody';
    const result = parseFrontmatter(source, dir);
    expect(result.meta.customJs).toBe(path.join(dir, 'extras.js'));
    fs.rmSync(dir, { recursive: true });
  });

  test('parses hero fields (kicker, subtitle, pills)', () => {
    const source = '---\nkicker: "Prologue"\nsubtitle: "A story"\npills:\n  - tag1\n  - tag2\n---\n\nBody';
    const result = parseFrontmatter(source, '/tmp');
    expect(result.hero.kicker).toBe('Prologue');
    expect(result.hero.subtitle).toBe('A story');
    expect(result.hero.pills).toEqual(['tag1', 'tag2']);
  });

  test('invalid YAML throws CompileError', () => {
    const source = '---\n: invalid: yaml: {{{\n---\n\nBody';
    expect(() => parseFrontmatter(source, '/tmp')).toThrow(/Invalid YAML frontmatter/);
  });

  test('unknown frontmatter key throws CompileError', () => {
    const source = '---\ntitle: "Test"\nunknown_key: "value"\n---\nBody';
    expect(() => parseFrontmatter(source, '/tmp')).toThrow(/Invalid frontmatter key "unknown_key"/);
  });

  test('handles CRLF line endings', () => {
    const source = '---\r\ntitle: "CRLF"\r\n---\r\nBody';
    const result = parseFrontmatter(source, '/tmp');
    expect(result.meta.title).toBe('CRLF');
    expect(result.body).toBe('Body');
  });

  test('parses author field', () => {
    const source = '---\nauthor: "Jane Doe"\n---\n\nBody';
    const result = parseFrontmatter(source, '/tmp');
    expect(result.meta.author).toBe('Jane Doe');
  });

  test('non-string title throws CompileError', () => {
    const source = '---\ntitle: 123\n---\n\nBody';
    expect(() => parseFrontmatter(source, '/tmp')).toThrow(/"title" must be a string/);
  });

  test('non-array pills throws CompileError', () => {
    const source = '---\npills: "not-an-array"\n---\n\nBody';
    expect(() => parseFrontmatter(source, '/tmp')).toThrow(/"pills" must be an array of strings/);
  });

  test('parses bg_lum with Option A slice string syntax', () => {
    const src1 = '---\nbg_lum: "0.0 : 0.85"\n---\nBody';
    expect(parseFrontmatter(src1, '/tmp').meta.bgLum).toEqual({ dark: 0.0, light: 0.85 });

    const src2 = '---\nbg_lum: "[:0.85]"\n---\nBody';
    expect(parseFrontmatter(src2, '/tmp').meta.bgLum).toEqual({ light: 0.85 });

    const src3 = '---\nbg_lum: "[0.0:]"\n---\nBody';
    expect(parseFrontmatter(src3, '/tmp').meta.bgLum).toEqual({ dark: 0.0 });
  });

  test('parses bg_lum with Option A array syntax', () => {
    const src = '---\nbg_lum:\n  - 0.0\n  - 0.9\n---\nBody';
    expect(parseFrontmatter(src, '/tmp').meta.bgLum).toEqual({ dark: 0.0, light: 0.9 });
  });

  test('parses theme field (dark and light)', () => {
    const srcDark = '---\ntheme: dark\n---\nBody';
    expect(parseFrontmatter(srcDark, '/tmp').meta.theme).toBe('dark');

    const srcLight = '---\ntheme: light\n---\nBody';
    expect(parseFrontmatter(srcLight, '/tmp').meta.theme).toBe('light');
  });

  test('invalid theme throws CompileError', () => {
    const src = '---\ntheme: blue\n---\nBody';
    expect(() => parseFrontmatter(src, '/tmp')).toThrow(/"theme" must be either "dark" or "light"/);
  });
});
