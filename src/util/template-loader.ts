/**
 * Unified template file loader.
 * Probes candidate paths relative to the CLI binary and CWD, throws if not found.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function loadTemplate(filename: string): string {
  let dir = '';
  try {
    if (typeof __dirname !== 'undefined') {
      dir = __dirname;
    } else if (typeof import.meta !== 'undefined' && import.meta.url) {
      dir = path.dirname(fileURLToPath(import.meta.url));
    }
  } catch {
    dir = '';
  }

  const candidates = [
    path.resolve(dir, '..', 'templates', filename),
    path.resolve(dir, '..', '..', 'templates', filename),
    path.resolve(process.cwd(), 'templates', filename),
    path.resolve(process.cwd(), 'src', 'templates', filename),
    path.resolve(process.cwd(), '..', 'templates', filename),
  ];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
    } catch { /* try next candidate */ }
  }

  throw new Error(`${filename} template not found (searched: ${candidates.join(', ')})`);
}
