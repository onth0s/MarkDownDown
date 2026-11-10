import { reportCliError, printCompileSummary, printCheckReport } from '../src/cli/report.js';
import { executeCheck } from '../src/cli/run-check.js';
import { confirmOverwrite } from '../src/cli/run-compile.js';
import { CompileError } from '../src/util/error.js';
import type { CliOptions } from '../src/types.js';

describe('CLI modules: report and run handlers', () => {
  test('reportCliError formats CompileError cleanly', () => {
    let output = '';
    const mockStream = {
      write(chunk: string) {
        output += chunk;
        return true;
      },
    };

    reportCliError(new CompileError('Syntax error in diagram'), false, mockStream);
    expect(output).toBe('ERROR: Syntax error in diagram\n');
  });

  test('reportCliError appends stack trace when debug=true', () => {
    let output = '';
    const mockStream = {
      write(chunk: string) {
        output += chunk;
        return true;
      },
    };

    const err = new Error('Unexpected failure');
    reportCliError(err, true, mockStream);
    expect(output).toContain('ERROR: Unexpected failure\n');
    expect(output).toContain(err.stack);
  });

  test('printCompileSummary formats sizes in KB and MB', () => {
    let output = '';
    const mockStream = {
      write(chunk: string) {
        output += chunk;
        return true;
      },
    };

    printCompileSummary(
      {
        sections: 5,
        wikilinks: 3,
        frontmatterKeys: 4,
        title: 'Doc Title',
        accent: '#3b82f6',
        outputFile: 'out.html',
        sizeBytes: 1500,
      },
      42,
      'single',
      true,
      mockStream,
    );

    expect(output).toContain('Title:       Doc Title');
    expect(output).toContain('1.5 KB');
    expect(output).toContain('42ms');
  });

  test('printCheckReport outputs pass result', () => {
    let output = '';
    const mockStream = {
      write(chunk: string) {
        output += chunk;
        return true;
      },
    };

    printCheckReport(
      'source.mdd',
      'artifact.html',
      {
        ok: true,
        byteEqual: true,
        semanticEqual: true,
        message: 'byte PASS | SEMANTIC: PASS',
      },
      false,
      mockStream,
    );

    expect(output).toContain('Source:      source.mdd');
    expect(output).toContain('Result:     PASS');
  });

  test('confirmOverwrite returns true when non-TTY', async () => {
    const origIsTTY = process.stdin.isTTY;
    try {
      process.stdin.isTTY = false;
      const res = await confirmOverwrite('any-file.html');
      expect(res).toBe(true);
    } finally {
      process.stdin.isTTY = origIsTTY;
    }
  });

  test('executeCheck returns exit code 1 for unresolvable files', () => {
    const opts: CliOptions = {
      single: true,
      split: false,
      noDiagrams: false,
      noTables: false,
      verbose: false,
    };
    const code = executeCheck('nonexistent-file.mdd', undefined, opts);
    expect(code).toBe(1);
  });
});
