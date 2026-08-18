/**
 * Generate a GFM-style slug from heading text.
 * Matches markdown-it's anchor behavior: lowercase, non-alphanumeric → hyphens,
 * leading/trailing hyphens stripped.
 */
export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
