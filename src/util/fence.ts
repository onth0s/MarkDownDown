/**
 * Parse TITLE: directive from raw diagram/table source.
 * Returns { title, body } where body has the TITLE: line removed.
 */
export function parseTitleDirective(source: string): { title: string; body: string } {
  const lines = source.split(/\r?\n/);
  let title = '';
  let titleLineIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('%%')) continue;
    if (trimmed.toUpperCase().startsWith('TITLE:')) {
      title = trimmed.slice(6).trim();
      titleLineIdx = i;
      break;
    }
    break;
  }

  if (titleLineIdx >= 0) {
    const remainingLines = [...lines.slice(0, titleLineIdx), ...lines.slice(titleLineIdx + 1)];
    return {
      title,
      body: remainingLines.join('\n'),
    };
  }

  return { title: '', body: source };
}
