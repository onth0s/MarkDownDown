/**
 * Parse TITLE: directive from raw diagram/table source.
 * Returns { title, body } where body has the TITLE: line removed.
 */
export function parseTitleDirective(source: string): { title: string; body: string } {
  const lines = source.split('\n');
  const first = lines[0].trim();
  if (first.toUpperCase().startsWith('TITLE:')) {
    return {
      title: first.slice(6).trim(),
      body: lines.slice(1).join('\n'),
    };
  }
  return { title: '', body: source };
}
