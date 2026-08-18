/** CLI options derived from YAML frontmatter + command-line flags */
export interface Options {
  /** Document title. Fallback: .mdd filename stem. */
  title: string;
  /** Author name (informational only) */
  author?: string;
  /** Path to assets directory (default: ./assets/ relative to .mdd file) */
  assetsDir: string;
  /** Accent color hex (default: #3b82f6) */
  accent: string;
  /** Path to optional extra CSS file (content will be inlined) */
  customCss?: string;
  /** Path to optional extra JS file (content will be inlined) */
  customJs?: string;
  /** Absolute path to the source .mdd file */
  inputFile: string;
  /** Absolute path to the output file (--single) or directory (--split) */
  outputPath: string;
  /** Output mode: single self-contained HTML or split CSS/JS/assets */
  outputMode: 'single' | 'split';
  /** Skip diagram SVG rendering */
  noDiagrams: boolean;
  /** Skip table SVG rendering */
  noTables: boolean;
  /** Verbose output */
  verbose: boolean;
}

/** Raw CLI options parsed by commander */
export interface CliOptions {
  output?: string;
  single: boolean;
  split: boolean;
  assetsDir?: string;
  noDiagrams: boolean;
  noTables: boolean;
  verbose: boolean;
}

/** A heading extracted from the document */
export interface Heading {
  /** Raw display text of the heading */
  text: string;
  /** GFM-style slug (markdown-it generated) */
  id: string;
  /** Heading level 1–6 */
  level: number;
}

/** A resolved asset (file in the assets directory) */
export interface Asset {
  /** The search key used to find this asset */
  key: string;
  /** Absolute path to the asset file */
  absolutePath: string;
  /** Relative path from the .mdd file location */
  relativePath: string;
  /** MIME type / category */
  kind: 'image' | 'video' | 'mdd' | 'other';
}

/** Result of resolving a single [[str]] wikilink */
export type Resolution =
  | { type: 'heading'; heading: Heading; display: string }
  | { type: 'asset'; asset: Asset; display: string }
  | { type: 'error'; message: string };

/** A wikilink token emitted by the wikilink inline rule */
export interface WikilinkToken {
  /** The raw target string (before the | if present) */
  target: string;
  /** The display text (after | if present; otherwise same as target) */
  display: string;
  /** Source position for error reporting */
  pos: number;
}

/** Parsed diagram block */
export interface DiagramBlock {
  /** Optional title from TITLE: directive */
  title: string | null;
  /** Raw diagram body (without TITLE: line) */
  body: string;
}

/** Parsed table block */
export interface TableBlock {
  /** Optional title from TITLE: directive */
  title: string | null;
  /** Header cells */
  headers: string[];
  /** Data rows, each an array of cells */
  rows: string[][];
}

/** Final compile result */
export interface CompileResult {
  /** The final HTML string */
  html: string;
  /** Any warnings accumulated during compilation */
  warnings: string[];
}

/** A wikilink collected during token walk, awaiting resolution */
export interface PendingWikilink {
  target: string;
  display: string;
  resolved?: import('./resolver/collision.js').ResolvedLink;
  error?: string;
}
