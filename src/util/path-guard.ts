import path from 'node:path';
import { CompileError } from './error.js';

/**
 * Resolve `rawPath` relative to `baseDir` and enforce confinement within `rootDir`
 * unless `allowExternalPaths` is true (in which case a warning is emitted).
 */
export function resolveConfinedPath(
  label: string,
  rawPath: string,
  baseDir: string,
  rootDir: string,
  allowExternalPaths: boolean,
  warnings: string[],
): string {
  const resolvedRoot = path.resolve(rootDir);
  const resolved = path.resolve(baseDir, rawPath);
  const rel = path.relative(resolvedRoot, resolved);
  const isExternal = rel.startsWith('..') || path.isAbsolute(rel);
  if (isExternal) {
    if (!allowExternalPaths) {
      throw new CompileError(
        `${label} ("${rawPath}") resolves outside the input directory ("${resolvedRoot}"). External paths are blocked by default for security; pass --allow-external-paths to override.`,
      );
    }
    warnings.push(
      `${label} ("${rawPath}") resolves outside the input directory ("${resolvedRoot}"). External paths may break if files are moved or paths change.`,
    );
  }
  return resolved;
}
