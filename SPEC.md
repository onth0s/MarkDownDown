---
title: "Markdown++ Language Specification"
accent: "#3b82f6"
theme: "dark"
---

# Markdown++ Language Specification

> [!NOTE]
> **Status:** Ratified specification for the Markdown++ compiler and runtime engine (`markdowndown` / `mdd`).

---

## 1. Overview

Markdown++ (`.mdd`) is standard GitHub-Flavored Markdown extended with:

- [[YAML Frontmatter]] for document metadata and theming
- [[Inline Extension: Wikilinks|Wikilinks]] (`[[str]]` and `[[str|display]]`)
- [[File Link Resolution]] (`[text](file:///path/to/file#L10)`)
- [Diagram DSL](./DSL.md) (` ```diagram `) for interactive SVG flowcharts
- [Table DSL](./DSL.md) (` ```table `) for interactive SVG data tables
- **Item / Glossary Headings** — `# * Term`, `## * Term`, `### * Term`, `#### * Term` bulleted hierarchy with automatic bullet-stripping and anchor generation
- [[Callout Alerts]] — `[!]` and `[!STRING]` accent-styled notification blocks

Everything else is standard GFM.

---

## 2. YAML Frontmatter

Delimited by `---` fences at the start of the document:

```yaml
---
title: "Document Title"
accent: "#3b82f6"
theme: "dark"
bg_lum: "0.0 : 0.95"
assets_dir: "./assets"
custom_css: "./extras.css"
custom_js: "./extras.js"
---
```

```table
TITLE: Frontmatter Configuration Keys
| Key | Type | Default | Description |
| title | string | .mdd filename | Document title for navbar, brand, and hero |
| author | string | (none) | Author metadata |
| assets_dir | string | ./assets/ | Directory for wikilink asset scanning |
| accent | string | #3b82f6 | Hex accent color driving CSS variables and SVG fills |
| theme | string | dark | Initial color theme (dark or light) |
| bg_lum | string/array/object | [0.08 : 0.96] | Background luminosity overrides for dark and light modes |
| logo | string | (none) | Custom brand logo SVG / image path and dynamic favicon |
| custom_css | string | (none) | Extra stylesheet inlined into document |
| custom_js | string | (none) | Extra JavaScript script inlined into document |
```

### 2.1 Background Luminosity (`bg_lum`)

Accepts slice syntax, arrays, or key-value mappings:

- **Slice / Array syntax**:
  - `bg_lum: "0.0 : 0.9"` — dark mode pitch black (`0.0`), light mode `0.9`
  - `bg_lum: "[:0.85]"` or `bg_lum: ": 0.85"` — dark default, light `0.85`
  - `bg_lum: "[0.0:]"` or `bg_lum: "0.0 :"` — dark `0.0`, light default
  - `bg_lum: [0.0, 0.9]` or `bg_lum: [null, 0.9]`
- **Mapping syntax**:
  ```yaml
  bg_lum:
    dark: 0.05
    light: 0.95
  ```

---

## 3. Inline Extension: Wikilinks `[[str]]`

### 3.1 Syntax

```table
TITLE: Wikilink Syntax Forms
| Form | Meaning |
| [[str]] | Self-referencing link. Display text = str. |
| [[str\|display]] | Aliased link. Resolves str, displays display. |
| \[[str]] | Escaped. Renders as literal [[str]]. |
```

Inside fenced code blocks and inline code, `[[str]]` is always literal.

### 3.2 Resolution Order (first match wins)

```diagram LR
TITLE: Wikilink 4-Step Resolution Pipeline
INPUT["Wikilink [[str]] — Extracted from inline tokens"]
EXT_CHECK{"Has file extension? — e.g. logo.png"}
HEADING["Pass 1-4 Heading Match — Fuzzy match against h1-h6"]
FILE_MATCH["File Asset Match — Probe ./assets directory"]
RENDER_A["Render Link <a> — Anchor jump to #heading-slug"]
RENDER_MEDIA["Render Media — Base64 <img> or <video> tag"]
FAIL["Compile Error — Ambiguity or unresolved target"]

INPUT --> EXT_CHECK
EXT_CHECK -->|Yes| FILE_MATCH
EXT_CHECK -->|No| HEADING
HEADING -->|Found 1 Match| RENDER_A
HEADING -->|0 Matches| FILE_MATCH
HEADING -->|Multiple Matches| FAIL
FILE_MATCH -->|Found Asset| RENDER_MEDIA
FILE_MATCH -->|Not Found| FAIL
```

1. **Extension fast-path**: If `str` contains a `.`, heading matching is skipped and the resolver probes for file assets directly.
2. **Heading match**: If `str` has no extension, it evaluates against document headings using the 4-pass fuzzy resolver.
3. **File match**: Checked against the assets directory (supports images, videos, `.mdd`, and `.md` documents).
4. **Ambiguity / Collision**: Multiple matches trigger a compile error with detailed candidate diagnostics.

---

## 4. Fuzzy Heading Resolver

Resolves `[[str]]` against all `h1`–`h6` document headings in 4 sequential passes:

- **Pass 1 — Exact Match**: Case-sensitive exact string equality (`str === heading.text`).
- **Pass 2 — Normalized Match**: Case-insensitive comparison with non-alphanumerics stripped and whitespace collapsed.
- **Pass 3 — Substring Match**: Prefix matching or bidirectional substring containment.
- **Pass 4 — Levenshtein Distance**: Fuzzy edit distance within tolerance `max(2, floor(len * 0.3))`.

---

## 5. Escaping

- `\[[str]]` → literal `[[str]]`
- Inside `` `inline code` `` → literal
- Inside fenced code blocks → literal
- Standard GFM backslash escapes apply for all standard markdown syntax.

---

## 6. Heading ID Generation & Item Headings

All headings (`h1`–`h6`) receive an `id` attribute for anchor linking and TOC indexing:

```
slugify(text) = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
```

### 6.1 Item / Glossary Headings

Headings prefixed with a bullet (`*`, `-`, or `•`) are treated as **Item Headings**:

```markdown
### Architecture & Design

#### * Virtual Canvas
High-performance coordinate transform container.

#### * Border Synthesis
Synchronous interval-merging border carving algorithm.
```

- **Clean Slug**: The bullet is automatically stripped from the slug (`#### * Virtual Canvas` → `id="virtual-canvas"`).
- **Dot Indicator**: Rendered with an accent bullet dot (`•`) in both the sidebar TOC and the document content.

---

## 7. File Link Resolution (`file:///...`)

Markdown++ natively validates and resolves standard Markdown links pointing to file URIs (`[text](file:///path/to/file.ts#L10)`):

- **URI Protocol Allowance**: Protocols including `file:`, `vscode:`, `http:`, `https:`, and `mailto:` are permitted.
- **Disk Verification & Path Normalization**: Automatically verifies file existence on disk with fallback path normalization.
- **Graceful Warning**: If a linked file cannot be found on disk, a non-fatal compiler warning is emitted (`File link target not found: "file:///..."`), and the link renders normally as `<a href="file:///...">text</a>`.

---

## 8. CLI Interface

```powershell
mdd <input.mdd> [options]
```

```table
TITLE: Markdown++ CLI Options
| Option | Type | Default | Description |
| -o, --output <path> | string | (auto) | Output HTML file or directory |
| --single | flag | true | Single self-contained HTML with inlined styles, scripts, and base64 assets |
| --split | flag | false | Separate output into document.html, style.css, app.js, and assets/ |
| --assets-dir <path> | string | ./assets/ | Custom assets directory for asset resolution |
| --no-diagrams | flag | false | Skip diagram SVG rendering |
| --no-tables | flag | false | Skip table SVG rendering |
| --minify | flag | true | Minify CSS/JS/HTML in monolithic export |
| --no-minify | flag | false | Disable minification in monolithic export |
| -L, --logo [path] | string/flag | (auto) | Custom brand logo SVG/image and dynamic favicon |
| -F, --force | flag | false | Force overwrite without confirmation prompt |
| -v, --verbose | flag | false | Verbose compiler logging |
| --spec | flag | false | Print the full MD++ language specification and exit |
| -V, --version | flag | false | Output the compiler version number |
| -h, --help | flag | false | Show CLI help and options |
```

---

## 9. Output Modes

### 9.1 `--single` (default)

Produces a standalone, portable HTML file with all dependencies inlined:

```
dist/
└── document.html      # Monolithic bundle: <style>, <script>, base64 images
```

### 9.2 `--split`

Produces a modular web folder:

```
dist/
├── document.html      # HTML with <link rel="stylesheet"> and <script src>
├── style.css          # Core stylesheet
├── app.js             # Runtime JavaScript (TOC, search, theme, nav history)
└── assets/            # Copied asset directory
```

---

## 10. Processing Pipeline

```diagram
TITLE: Markdown++ 5-Stage Compilation Architecture
SRC["1. Source .mdd — Raw document & frontmatter"]
LEX["2. Lexer & Tokenizer — markdown-it + wikilink & fence rules"]
RES["3. Resolver — Heading index + asset directory scanner"]
REN["4. Renderer — HTML body + SVG diagram & table generation"]
ASM["5. Output Assembler — Inject into shell template with styles & scripts"]
OUT["HTML Output — Standalone single-file or split site"]

SRC --> LEX
LEX --> RES
RES --> REN
REN --> ASM
ASM --> OUT
```

---

## 11. Callout Alerts (`[!]` & `[!STRING]`)

Blockquotes starting with `[!]` or `[!<tag>]` are rendered as accent-styled callout containers:

```markdown
> [!]
> Highlighted callout without a header title

> [!NOTE]
> Information callout with a header title

> [!SYNTHESIS]
> Custom arbitrary callout title
```

- **Bare Highlight `[!]`**: Renders a highlighted container without a title banner.
- **String-Agnostic `[!STRING]`**: Accepts any identifier (`[!NOTE]`, `[!WARNING]`, `[!KEY TAKEAWAY]`, etc.), capitalized into the title header.
- **Color & Accent Unified**: Rendered with the document's accent color theme (`class="alert"`).

---

## 12. In-Page Navigation History Stack

Markdown++ documents feature an in-page navigation manager for internal wikilink traversal:

- **Bidirectional History Stack**: Preserves exact scroll position and origin wikilink tokens on forward and backward navigation (`Alt+Left` / `Alt+Right` / `Escape`).
- **Floating Pill UI**: Fixed outside the sidebar to the right in the content column, displaying previous/next destination labels, a clear button (`×`), and bidirectional navigation controls.
- **Search Query Preservation**: Restores previous search query state and exact scroll coordinates when navigating back from a jump performed during an active search.
- **High-Contrast Arrival Pulse**: Pulses destination headings on forward jumps and origin wikilinks on history undo with text luminosity inversion.

---

## 13. Design Decisions

```table
TITLE: Key Architectural Design Decisions
| # | Decision | Rationale |
| D1 | Title fallback: frontmatter title -> first H1 -> filename | Predictable hierarchy without magic |
| D2 | Table alignment: uniform left-alignment | High scannability and cleaner SVG rendering |
| D3 | Fence languages: diagram and table only | Strict, clean language specification |
| D4 | Diamond nodes {text} in v1 diagram DSL | Essential for decision branching |
| D5 | Error format: stderr + non-zero exit code | Clean CLI integration for pipelines and scripts |
| D6 | Single-file default: --single | Maximum portability for technical specs and docs |
| D7 | Runtime: Node.js + TypeScript | High performance with rich ecosystem |
| D8 | Parser: markdown-it with custom token rules | Most extensible and robust CommonMark parser |
| D9 | Base64 inlining for --single mode | Zero external dependencies for standalone distribution |
| D10 | Non-fatal warnings for missing file URIs | Preserves functional link markup in technical docs |
```
