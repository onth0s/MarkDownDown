/**
 * Byte-identity regressions in the source skeleton.
 *
 * The download button hands the user the reconstruction back as their file, so
 * `--check` ratifies bytes, not just meaning. markdown-it normalises a fair
 * amount of source away before any renderer sees it — most visibly the
 * `.trim()` its `paragraph` / `list_item` / heading rules apply, which deletes
 * a line's trailing spaces and tabs outright. The DOM cannot hold those bytes
 * and no token carries them, so the skeleton has to read them back off the raw
 * block slice, or the rebuild silently loses them.
 *
 * Every source here is built in a temp dir from explicit escapes: a fixture file
 * with real trailing whitespace would be at the mercy of editors and git's
 * whitespace handling.
 */
import { compile } from '../src/compile.js';
import { checkRoundTrip } from '../src/pipeline/check.js';
import { createMarkdownParser } from '../src/parser/markdown.js';
import type { Options } from '../src/types.js';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SP = '\x20'; // a single trailing space
const TAB = '\t';

const sha = (s: string): string => createHash('sha256').update(s).digest('hex');

/** Compile `source` from disk and assert the rebuild is byte-identical. */
function expectByteIdentical(source: string): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md++-ws-'));
  try {
    const inputFile = path.join(dir, 'doc.mdd');
    fs.writeFileSync(inputFile, source, 'utf8');
    const options: Options = {
      inputFile,
      outputPath: path.join(dir, 'out.html'),
      outputMode: 'single',
      assetsDir: dir,
      title: 'Whitespace',
      accent: '#3b82f6',
      minify: true,
      noDiagrams: false,
      noTables: false,
      verbose: false,
    };
    const { html } = compile(options);
    const result = checkRoundTrip({ md: createMarkdownParser(), html, rawSource: source });

    // The hash assertions carry the diagnosis: a failure names the source hash
    // it expected and the byte count that diverged.
    expect(result.semanticEqual).toBe(true);
    expect(result.byteEqual).toBe(true);
    expect(result.rebuiltHash).toBe(sha(source));
    expect(result.rebuiltBytes).toBe(source.length);
    // Byte identity is the recovery bar: a lost space must fail the check, not
    // be reported as an informational "byte differs".
    expect(result.ok).toBe(true);
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort temp cleanup
    }
  }
}

describe('skeleton byte fidelity: whitespace markdown-it discards', () => {
  test('a paragraph ending in a space keeps it', () => {
    expectByteIdentical(`Trailing space at the end of a paragraph.${SP}\n`);
  });

  test('a paragraph ending in a tab keeps it', () => {
    expectByteIdentical(`Trailing tab at the end of a paragraph.${TAB}\n`);
  });

  test('a paragraph ending in several spaces keeps all of them', () => {
    expectByteIdentical(`Trailing run of spaces.${SP.repeat(5)}\n`);
  });

  test('interior soft-break and hard-break whitespace is untouched', () => {
    expectByteIdentical(
      [`Soft break, one space.${SP}`, 'continues here', `Hard break, two spaces.${SP.repeat(2)}`, 'after the break', ''].join('\n'),
    );
  });

  test('a list item keeps its trailing space', () => {
    expectByteIdentical(`- list item with a trailing space.${SP}\n- second item\n`);
  });

  test('a nested list item keeps its trailing space', () => {
    expectByteIdentical([`- outer item${SP}`, `  - inner item with a trailing space.${SP}`, ''].join('\n'));
  });

  test('a blockquote line keeps its trailing space', () => {
    expectByteIdentical(`> quoted line with a trailing space.${SP}\n`);
  });

  test('an ATX heading keeps its trailing whitespace', () => {
    expectByteIdentical(`## Heading with a trailing space.${SP}\n\nbody\n`);
  });

  test('a setext heading keeps its title whitespace', () => {
    expectByteIdentical([`Setext title with a trailing space.${SP}`, '------------------', '', 'body', ''].join('\n'));
  });

  test('a body ending in exactly one newline does not gain a second', () => {
    // The regression: split('\n') leaves a phantom '' after the final newline,
    // and emitting it as a line manufactured a blank line the author never
    // wrote, so the rebuild came back one newline longer than the source.
    expectByteIdentical(`## License\n\nMIT License.\n`);
  });

  test('a body with no trailing newline does not gain one', () => {
    expectByteIdentical(`## License\n\nMIT License.`);
  });

  test('a body ending in several blank lines keeps exactly those', () => {
    expectByteIdentical(`## License\n\nMIT License.\n\n\n\n`);
  });

  test('CRLF sources keep CRLF and lose nothing', () => {
    expectByteIdentical(`## Title\r\n\r\nA paragraph ending in a space.${SP}\r\n\r\n- item${SP}\r\n`);
  });

  test('trailing whitespace around a fenced block is preserved', () => {
    expectByteIdentical(
      ['text before', '', '```js', 'const a = 1;', '```' + SP, '', `after the fence.${SP}`, ''].join('\n'),
    );
  });
});
