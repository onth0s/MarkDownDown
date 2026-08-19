/**
 * MD++ language specification, loaded from SPEC.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

declare const __SPEC_CONTENT__: string | undefined;

function resolveSpec(): string {
  if (typeof __SPEC_CONTENT__ !== 'undefined' && __SPEC_CONTENT__) {
    return __SPEC_CONTENT__;
  }
  try {
    const dir = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
      path.resolve(dir, '..', 'SPEC.md'),
      path.resolve(dir, 'SPEC.md'),
      path.resolve(process.cwd(), 'SPEC.md'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        return fs.readFileSync(p, 'utf8');
      }
    }
  } catch {
    // fallback
  }
  return '# Markdown++ Language Specification\n';
}

export const SPEC = resolveSpec();
