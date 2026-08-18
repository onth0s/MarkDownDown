/**
 * Unified template file loader.
 * Probes candidate paths relative to CWD and throws if not found.
 */
import fs from 'node:fs';
import path from 'node:path';

export function loadTemplate(filename: string): string {
  const candidates = [
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
