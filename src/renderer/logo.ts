/**
 * Default logo constants (MD++ stub).
 *
 * A clean rounded rectangle with "MD++" typography.
 */

/** Path / shape definition for the inline navbar SVG. */
export const DEFAULT_LOGO_PATHS: string =
  `<rect x="64" y="64" width="896" height="896" rx="220" fill="var(--accent)"/>` +
  `<text x="512" y="580" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="280" letter-spacing="-0.04em" fill="var(--accent-fg)">MDD</text>`;

export const CLDS_LOGO_PATHS: string = DEFAULT_LOGO_PATHS;

/** Favicon SVG template with {accent}, {accentDark}, and {accentFg} placeholders. */
export const DEFAULT_FAVICON_TEMPLATE: string =
  `<svg viewBox="0 0 1024 1024" width="64" height="64" fill="none" xmlns="http://www.w3.org/2000/svg">` +
  `<rect x="64" y="64" width="896" height="896" rx="220" fill="{accent}"/>` +
  `<text x="512" y="580" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="280" letter-spacing="-0.04em" fill="{accentFg}">MDD</text>` +
  `</svg>`;

export const CLDS_FAVICON_TEMPLATE: string = DEFAULT_FAVICON_TEMPLATE;
