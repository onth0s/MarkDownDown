import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
  const isFileUri = /^file:/i.test(rawHref);

  if (!isFileUri) {
    return { href: rawHref, exists: true };
  }

  // Separate URL from hash/fragment (e.g. #L73) and query (?foo=bar)
  const hashIdx = rawHref.indexOf('#');
  const fragment = hashIdx >= 0 ? rawHref.slice(hashIdx) : '';
  const beforeHash = hashIdx >= 0 ? rawHref.slice(0, hashIdx) : rawHref;
  const queryIdx = beforeHash.indexOf('?');
  const urlWithoutHash = queryIdx >= 0 ? beforeHash.slice(0, queryIdx) : beforeHash;

  let filePath: string;
  try {
    filePath = fileURLToPath(urlWithoutHash);
  } catch {
    let clean = urlWithoutHash.replace(/^file:\/\/\/?/i, '');
    try {
      clean = decodeURIComponent(clean);
    } catch {
      // Keep raw string if percent-encoding is malformed
    }
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

  // 2. Fuzzy directory fixes: underscore variations in path segments and basename fallback
  const candidateFixes = [
    filePath.replace(/([/\\])([^/\\]*?)__([^/\\]*?)([/\\])/g, '$1$2_$3$4'),
    filePath.replace(/([/\\])([^/\\]*?)_([^/\\]*?)([/\\])/g, '$1$2__$3$4'),
    path.resolve(inputDir, path.basename(filePath)),
  ];

  for (const candidate of candidateFixes) {
    if (candidate !== filePath && fs.existsSync(candidate)) {
      return { href: `${pathToFileURL(candidate).href}${fragment}`, exists: true };
    }
  }

  // 3. Not found
  return {
    href: rawHref,
    exists: false,
    warning: `File link target not found: "${rawHref}"`,
  };
}
