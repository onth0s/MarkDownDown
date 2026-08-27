/**
 * Unified template file loader.
 * Probes candidate paths relative to the CLI binary and CWD, throws if not found.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CompileError } from './error.js';

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

  const baseName = filename.replace(/\.[^.]+$/, '');
  const candidateDirs = [
    path.resolve(dir, '..', 'templates'),
    path.resolve(dir, '..', '..', 'templates'),
    path.resolve(process.cwd(), 'templates'),
    path.resolve(process.cwd(), 'src', 'templates'),
    path.resolve(process.cwd(), '..', 'templates'),
  ];

  // 1. Check for modular subdirectory (e.g. templates/app/*.js -> merged app.js)
  for (const tDir of candidateDirs) {
    const modDir = path.join(tDir, baseName);
    if (fs.existsSync(modDir) && fs.statSync(modDir).isDirectory()) {
      const files = fs.readdirSync(modDir).filter(f => !f.startsWith('.')).sort();
      if (files.length > 0) {
        const parts = files.map(f => fs.readFileSync(path.join(modDir, f), 'utf8'));
        return `(() => {\n  'use strict';\n\n${parts.join('\n\n')}\n})();\n`;
      }
    }
  }

  // 2. Check for monolithic template file fallback
  for (const tDir of candidateDirs) {
    const filePath = path.join(tDir, filename);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return fs.readFileSync(filePath, 'utf8');
    }
  }

  throw new CompileError(`${filename} template not found (searched: ${candidateDirs.join(', ')})`);
}

/**
 * Replace all variable keys in a template string in a single regex pass.
 */
export function substituteTokens(template: string, vars: Record<string, string | (() => string)>): string {
  const keys = Object.keys(vars);
  if (keys.length === 0) return template;
  const pattern = new RegExp(keys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  return template.replace(pattern, (match) => {
    const val = vars[match];
    return typeof val === 'function' ? val() : val ?? match;
  });
}
