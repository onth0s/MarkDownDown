/** Background luminosity configuration for dark/light themes */
export interface BgLum {
  /** Dark mode base luminosity (0.0 = pitch OLED black, 1.0 = light grey). Default: 0.12 */
  dark?: number;
  /** Light mode base luminosity (0.0 = dark grey, 1.0 = pure white). Default: 0.98 */
  light?: number;
}

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
  /** Initial default color theme: 'dark' or 'light' (default: 'dark') */
  theme?: 'dark' | 'light';
  /** Background luminosity overrides for dark and light modes (0.0 to 1.0) */
  bgLum?: BgLum;
  /** Path to optional extra CSS file (content will be inlined) */
  customCss?: string;
  /** Path to optional extra JS file (content will be inlined) */
  customJs?: string;
  /** Path to optional custom brand logo (SVG or image) */
  logo?: string;
  /** Absolute path to the source .mdd file */
  inputFile: string;
  /** In-memory raw source string (optional, bypasses disk read) */
  rawSource?: string;
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
  /** Minify inlined CSS, JS, and HTML in monolithic export (default: true) */
  minify?: boolean;
}

/** Raw CLI options parsed by commander */
export interface CliOptions {
  output?: string;
  single: boolean;
  split: boolean;
  assetsDir?: string;
  logo?: string | boolean;
  noDiagrams: boolean;
  noTables: boolean;
  verbose: boolean;
  minify?: boolean;
  force?: boolean;
  spec?: boolean;
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

/** Presentation metadata for the hero section (extracted from frontmatter) */
export interface HeroMeta {
  kicker?: string;
  subtitle?: string;
  pills?: string[];
}

/** Final compile result */
export interface CompileResult {
  /** The final HTML string */
  html: string;
  /** Any warnings accumulated during compilation */
  warnings: string[];
  /** Document statistics */
  stats?: {
    sections: number;
    wikilinks: number;
    frontmatterKeys: number;
    title: string;
    accent: string;
    logo?: string;
    outputFile: string;
    sizeBytes: number;
  };
}

export { CompileError } from './util/error.js';

/** A wikilink collected during token walk, awaiting resolution */
export interface PendingWikilink {
  target: string;
  display: string;
  resolution: import('./resolver/wikilink.js').ResolvedLink | null;
  error?: string;
}
