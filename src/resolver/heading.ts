import type { Heading } from '../types.js';

/**
 * Extracts clean plain text from a markdown-it inline token's children.
 * Handles text, code spans, wikilinks, line breaks, etc.
 */
export function extractInlineText(children?: import('markdown-it/lib/token.mjs').default[] | null): string {
  if (!children || !children.length) return '';
  let out = '';
  for (const t of children) {
    if (t.type === 'text' || t.type === 'code_inline') {
      out += t.content;
    } else if (t.type === 'wikilink') {
      out += t.info || t.content;
    } else if (t.type === 'softbreak' || t.type === 'hardbreak') {
      out += ' ';
    }
  }
  return out;
}

/**
 * Extracts all headings (h1–h6) from a markdown-it token stream.
 * Returns an array of Heading objects in document order.
 */
export function extractHeadings(tokens: import('markdown-it/lib/token.mjs').default[]): Heading[] {
  const headings: Heading[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.type === 'heading_open') {
      const level = parseInt(tok.tag.slice(1), 10);
      const id = tok.attrGet('id') ?? '';
      // The inline token follows immediately
      const inline = tokens[i + 1];
      const text = extractInlineText(inline?.children);
      headings.push({ text, id, level });
    } else if (tok.type === 'blockquote_open' && tok.tag === 'div' && tok.attrGet('class')?.includes('alert')) {
      const id = tok.attrGet('id');
      if (id && tokens[i + 1]?.type === 'html_inline') {
        const match = tokens[i + 1].content.match(/<span class="alert-label">([^<]+)<\/span>/);
        if (match) {
          headings.push({ text: match[1], id, level: 3 });
        }
      }
    }
  }
  return headings;
}

// ── Normalisation helper ──────────────────────────────────────────────────────

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

// ── 4-pass fuzzy heading resolver ────────────────────────────────────────────

export type HeadingMatchResult =
  | { type: 'match'; heading: Heading; pass: string }
  | { type: 'ambiguous'; candidates: Array<{ heading: Heading; pass: string }> }
  | { type: 'not-found' };

export function resolveHeading(str: string, headings: Heading[]): HeadingMatchResult {
  // Pass 1 — Exact (case-sensitive, whitespace-exact)
  const exact = headings.filter((h) => h.text === str);
  if (exact.length === 1) return { type: 'match', heading: exact[0], pass: 'exact' };
  if (exact.length > 1) return {
    type: 'ambiguous',
    candidates: exact.map((h) => ({ heading: h, pass: 'exact' })),
  };

  // Pass 2 — Normalized
  const ns = norm(str);
  const normalized = headings.filter((h) => norm(h.text) === ns);
  if (normalized.length === 1) return { type: 'match', heading: normalized[0], pass: 'normalized' };
  if (normalized.length > 1) return {
    type: 'ambiguous',
    candidates: normalized.map((h) => ({ heading: h, pass: 'normalized' })),
  };

  // Pass 3 — Substring (prefix then containment)
  const substringMatches: Array<{ heading: Heading; pass: string }> = [];
  for (const h of headings) {
    const nh = norm(h.text);
    if (ns.startsWith(nh) || nh.startsWith(ns)) {
      substringMatches.push({ heading: h, pass: 'substring-prefix' });
    } else if (ns.includes(nh) || nh.includes(ns)) {
      substringMatches.push({ heading: h, pass: 'substring-contains' });
    }
  }
  // Deduplicate
  const seen = new Set<string>();
  const uniqueSub = substringMatches.filter(v => {
    if (seen.has(v.heading.id)) return false;
    seen.add(v.heading.id);
    return true;
  });
  if (uniqueSub.length === 1) return { type: 'match', heading: uniqueSub[0].heading, pass: uniqueSub[0].pass };
  if (uniqueSub.length > 1) return { type: 'ambiguous', candidates: uniqueSub };

  // Pass 4 — Levenshtein
  let minDist = Infinity;
  const lev: Array<{ heading: Heading; dist: number }> = [];
  for (const h of headings) {
    const nh = norm(h.text);
    const dist = levenshtein(ns, nh);
    const threshold = Math.max(2, Math.floor(nh.length * 0.3));
    if (dist <= threshold) {
      lev.push({ heading: h, dist });
      if (dist < minDist) minDist = dist;
    }
  }
  const closest = lev.filter((x) => x.dist === minDist);
  if (closest.length === 1) return {
    type: 'match',
    heading: closest[0].heading,
    pass: `Levenshtein d=${minDist}`,
  };
  if (closest.length > 1) return {
    type: 'ambiguous',
    candidates: closest.map((x) => ({ heading: x.heading, pass: `Levenshtein d=${x.dist}` })),
  };

  return { type: 'not-found' };
}

/**
 * Format a human-readable ambiguity error message.
 */
export function formatAmbiguityError(
  str: string,
  candidates: Array<{ heading: Heading; pass: string }>
): string {
  const lines = [
    `ERROR: [[${str}]] is ambiguous — matched ${candidates.length} headings:`,
    ...candidates.map((c, i) => `  ${i + 1}. "${c.heading.text}" (pass: ${c.pass})`),
    'Resolve to a unique string or use the full heading text.',
  ];
  return lines.join('\n');
}
