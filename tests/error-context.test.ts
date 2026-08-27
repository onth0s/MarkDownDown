import { CompileError, toErrorMessage, getOrThrow } from '../src/util/error.js';
import { loadTemplate } from '../src/util/template-loader.js';
import { validateNoNestedCodeWraps } from '../src/pipeline/copy-buttons.js';

describe('compiler error ergonomics (Gotcha #5)', () => {
  test('CompileError carries code + readable message', () => {
    const e = new CompileError('boom', 'E_X');
    expect(e.name).toBe('CompileError');
    expect(e.code).toBe('E_X');
    expect(toErrorMessage(e)).toBe('boom');
  });

  test('toErrorMessage degrades gracefully for non-Error throws', () => {
    expect(toErrorMessage('plain string')).toBe('plain string');
    expect(toErrorMessage(42)).toBe('42');
  });

  test('getOrThrow throws CompileError (not raw Error)', () => {
    const map = new Map<string, number>();
    expect(() => getOrThrow(map, 'missing', 'test context')).toThrow(CompileError);
    expect(() => getOrThrow(map, 'missing', 'test context')).toThrow(/test context: missing key missing/);
  });

  test('template-loader throws CompileError', () => {
    expect(() => loadTemplate('nonexistent_template_xyz.js')).toThrow(CompileError);
  });

  test('copy-buttons nested wrapper throws CompileError', () => {
    const nested = '<div class="code-wrap"><div class="code-wrap"></div></div>';
    expect(() => validateNoNestedCodeWraps(nested)).toThrow(CompileError);
  });
});
