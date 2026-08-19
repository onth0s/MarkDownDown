/**
 * MD++ language specification, loaded from SPEC.md and DSL.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

declare const __SPEC_CONTENT__: string | undefined;
declare const __DSL_CONTENT__: string | undefined;

function readFile(filename: string): string {
  try {
    const dir = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
      path.resolve(dir, '..', filename),
      path.resolve(dir, filename),
      path.resolve(process.cwd(), filename),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        return fs.readFileSync(p, 'utf8');
      }
    }
  } catch {
    // fallback
  }
  return '';
}

function resolveSpec(): string {
  const spec = (typeof __SPEC_CONTENT__ !== 'undefined' && __SPEC_CONTENT__) || readFile('SPEC.md') || '# Markdown++ Language Specification\n';
  const dsl = (typeof __DSL_CONTENT__ !== 'undefined' && __DSL_CONTENT__) || readFile('DSL.md') || '';

  if (dsl) {
    return `${spec.trimEnd()}\n\n---\n\n${dsl.trimEnd()}\n`;
  }
  return spec;
}

export const SPEC = resolveSpec();
