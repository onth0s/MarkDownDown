import fs from 'node:fs';
import path from 'node:path';
import { FRONTMATTER_BLOCK_RE } from '../parser/frontmatter.js';
import { CompileError } from '../util/error.js';
import { resolveConfinedPath } from '../util/path-guard.js';

export interface StitchResult {
  source: string;
  warnings: string[];
  includedFiles: string[];
}

const INCLUDE_LINE_RE = /^[ \t]*\[\[([^\]|\r\n]+?\.(?:md|mdd))(?:\|([+-]?\d+))?\]\][ \t]*$/i;
const FENCE_OPEN_RE = /^[ \t]*(`{3,}|~{3,})/;

function updateFenceState(line: string, activeFence: string | null): string | null {
  const m = line.match(FENCE_OPEN_RE);
  if (!m) return activeFence;
  const marker = m[1];
  if (!activeFence) return marker;
  if (marker[0] === activeFence[0] && marker.length >= activeFence.length && line.trim() === marker) {
    return null;
  }
  return activeFence;
}

function shiftHeadings(text: string, shift: number, eol: string): string {
  if (shift === 0) return text;
  const lines = text.split(/\r?\n/);
  let activeFence: string | null = null;
  const out = lines.map((line) => {
    activeFence = updateFenceState(line, activeFence);
    if (activeFence) return line;
    const m = line.match(/^(#{1,6})([ \t]+.*)$/);
    if (!m) return line;
    const nextLevel = Math.max(1, Math.min(6, m[1].length + shift));
    return '#'.repeat(nextLevel) + m[2];
  });
  return out.join(eol);
}

function expandIncludes(
  rawText: string,
  currentFile: string,
  rootDir: string,
  allowExternalPaths: boolean,
  stack: string[],
  warnings: string[],
  includedFiles: string[],
  isEntry: boolean,
): string {
  if (!rawText.includes('[[')) return rawText;

  const eol = rawText.includes('\r\n') ? '\r\n' : '\n';
  const currentDir = path.dirname(path.resolve(currentFile));
  const lines = rawText.split(/\r?\n/);
  const out: string[] = [];

  let activeFence: string | null = null;
  let inFrontmatter = isEntry && lines.length > 0 && /^\uFEFF?---\s*$/.test(lines[0]);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (inFrontmatter) {
      out.push(line);
      if (i > 0 && /^---\s*$/.test(line)) {
        inFrontmatter = false;
      }
      continue;
    }

    const prevFence = activeFence;
    activeFence = updateFenceState(line, activeFence);
    if (prevFence || activeFence) {
      out.push(line);
      continue;
    }

    const incMatch = line.match(INCLUDE_LINE_RE);
    if (!incMatch) {
      out.push(line);
      continue;
    }

    const rawTarget = incMatch[1].trim();
    const shift = incMatch[2] ? parseInt(incMatch[2], 10) : 0;
    const normalizedTarget = rawTarget.replace(/\\/g, '/');
    const resolved = resolveConfinedPath(
      `Include "[[${rawTarget}]]"`,
      normalizedTarget,
      currentDir,
      rootDir,
      allowExternalPaths,
      warnings,
    );

    if (stack.includes(resolved)) {
      const chain = [...stack, resolved]
        .map((p) => path.relative(rootDir, p) || path.basename(p))
        .join(' -> ');
      throw new CompileError(`Circular include detected: ${chain}`);
    }

    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      throw new CompileError(`Included file not found: "[[${rawTarget}]]" (resolved to ${resolved})`);
    }

    includedFiles.push(resolved);
    let childRaw = fs.readFileSync(resolved, 'utf8');
    childRaw = childRaw.replace(FRONTMATTER_BLOCK_RE, '');
    childRaw = childRaw.replace(/^(?:\r?\n)+|(?:\r?\n)+$/g, '');

    let expanded = expandIncludes(
      childRaw,
      resolved,
      rootDir,
      allowExternalPaths,
      [...stack, resolved],
      warnings,
      includedFiles,
      false,
    );
    expanded = shiftHeadings(expanded, shift, eol);
    if (expanded.length > 0) {
      out.push(expanded);
    }
  }

  return out.join(eol);
}

/**
 * Expand standalone `[[path/to/file.md]]` (and `.mdd`) include lines before parsing.
 * Strips child YAML frontmatter, supports optional heading shifts (`|+1`), detects
 * cycles, and enforces root-directory path confinement unless overridden.
 */
export function stitchDocument(
  rawSource: string,
  entryFile: string,
  allowExternalPaths = false,
): StitchResult {
  if (!rawSource.includes('[[')) {
    return { source: rawSource, warnings: [], includedFiles: [] };
  }

  const resolvedEntry = path.resolve(entryFile);
  const rootDir = path.dirname(resolvedEntry);
  const warnings: string[] = [];
  const includedFiles: string[] = [];

  const source = expandIncludes(
    rawSource,
    resolvedEntry,
    rootDir,
    allowExternalPaths,
    [resolvedEntry],
    warnings,
    includedFiles,
    true,
  );

  return { source, warnings, includedFiles };
}
