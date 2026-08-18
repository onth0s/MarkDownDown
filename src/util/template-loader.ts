/**
 * Unified template file loader.
 * Probes candidate paths relative to the CLI binary and CWD, throws if not found.
 */
import fs from 'node:fs';
import path from 'node:path';

declare const __dirname: string;

export function loadTemplate(filename: string): string {
  const candidates = [
    path.resolve(__dirname, '..', 'templates', filename),
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
