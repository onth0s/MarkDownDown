import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ResolvedFileLink {
  href: string;
  exists: boolean;
  warning?: string;
}

/**
 * Validates and resolves a file link (file:///... or relative file path).
 * If the file exists or can be matched via fuzzy path resolution, returns the verified href.
 * If not found, returns the original href and a warning message.
 */
export function resolveFileLink(rawHref: string, inputDir: string = process.cwd()): ResolvedFileLink {
  const isFileUri = rawHref.startsWith('file:') || rawHref.startsWith('file:///');

  if (!isFileUri) {
    return { href: rawHref, exists: true };
  }

  // Separate URL from hash/fragment (e.g. #L73) and query
  const hashIdx = rawHref.indexOf('#');
  const fragment = hashIdx >= 0 ? rawHref.slice(hashIdx) : '';
  const urlWithoutHash = hashIdx >= 0 ? rawHref.slice(0, hashIdx) : rawHref;

  let filePath: string;
  try {
    filePath = fileURLToPath(urlWithoutHash);
  } catch {
    let clean = urlWithoutHash.replace(/^file:\/\/\/?/i, '');
    clean = decodeURIComponent(clean);
    if (/^[a-zA-Z]:[/\\]/.test(clean)) {
      filePath = path.normalize(clean);
    } else {
      filePath = path.resolve(inputDir, clean);
    }
  }

  // 1. Direct check
  if (fs.existsSync(filePath)) {
    return { href: rawHref, exists: true };
  }

  // 2. Fuzzy directory fixes (e.g. 00_DEV <-> 00__DEV)
  const candidateFixes = [
    filePath.replace(/[/\\]00_DEV[/\\]/i, `${path.sep}00__DEV${path.sep}`),
    filePath.replace(/[/\\]00__DEV[/\\]/i, `${path.sep}00_DEV${path.sep}`),
    path.resolve(inputDir, path.basename(filePath)),
  ];

  for (const candidate of candidateFixes) {
    if (candidate !== filePath && fs.existsSync(candidate)) {
      const candidateNorm = candidate.replace(/\\/g, '/');
      const newFileUrl = candidateNorm.startsWith('/')
        ? `file://${candidateNorm}`
        : `file:///${candidateNorm}`;
      return { href: `${newFileUrl}${fragment}`, exists: true };
    }
  }

  // 3. Not found
  return {
    href: rawHref,
    exists: false,
    warning: `File link target not found: "${rawHref}"`,
  };
}
