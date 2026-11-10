import fs from 'node:fs';
import { toErrorMessage } from './error.js';

/**
 * Safely read an optional text file (such as custom CSS or custom JS).
 * Appends a descriptive warning if the file path is non-empty but cannot be read.
 */
export function readOptionalTextFile(
  filePath: string | undefined,
  label: string,
  warnings: string[],
): string | undefined {
  if (!filePath) return undefined;
  try {
    if (!fs.existsSync(filePath)) {
      warnings.push(`Specified ${label} not found: ${filePath}`);
      return undefined;
    }
    return fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    warnings.push(`Failed to read ${label} from ${filePath}: ${toErrorMessage(err)}`);
    return undefined;
  }
}
