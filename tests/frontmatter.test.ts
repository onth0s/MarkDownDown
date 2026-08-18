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
    expect(result.meta.kicker).toBe('Prologue');
    expect(result.meta.subtitle).toBe('A story');
    expect(result.meta.pills).toEqual(['tag1', 'tag2']);
  });

  test('ignores unknown keys', () => {
    const source = '---\ntitle: "Test"\nunknown_key: "value"\n---\nBody';
    const result = parseFrontmatter(source, '/tmp');
    expect(result.meta.title).toBe('Test');
    expect(result.body).toBe('Body');
  });

  test('invalid YAML returns body unchanged', () => {
    const source = '---\n: invalid: yaml: {{{\n---\n\nBody';
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = parseFrontmatter(source, '/tmp');
    expect(result.body).toBe(source);
    expect(stderrSpy).toHaveBeenCalledWith('WARN: Invalid YAML in frontmatter, ignoring.\n');
    stderrSpy.mockRestore();
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

  test('non-string title is ignored', () => {
    const source = '---\ntitle: 123\n---\n\nBody';
    const result = parseFrontmatter(source, '/tmp');
    expect(result.meta.title).toBeUndefined();
  });

  test('non-array pills is ignored', () => {
    const source = '---\npills: "not-an-array"\n---\n\nBody';
    const result = parseFrontmatter(source, '/tmp');
    expect(result.meta.pills).toBeUndefined();
  });
});
