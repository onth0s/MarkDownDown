---
title: "Markdown++ (MarkDownDown)"
accent: "#3b82f6"
---

# Markdown++ (`.mdd`)

> **Markdown++** (packaged as `markdowndown` / `mdd`) is GitHub-Flavored Markdown (GFM) extended with native wikilinks, interactive SVG diagram DSLs, SVG pipe tables, YAML frontmatter, and standalone HTML compilation.

---

## Table of Contents

- [[Overview]]
- [[Key Features]]
- [[Compilation Architecture]]
- [[Installation & Quick Start]]
- [[CLI Usage]]
- [[Syntax Reference]]
  - [[YAML Frontmatter]]
  - [[Wikilinks & Heading Resolution]]
  - [[Diagram DSL]]
  - [[Table DSL]]
- [[Development & Testing]]
- [[License]]

---

## Overview

Markdown++ (`.mdd`) extends standard GitHub Flavored Markdown with first-class authoring primitives designed for technical specs, complex documentation, and interactive systems design. 

Unlike traditional static site generators, Markdown++ produces self-contained or cleanly split HTML packages with zero external runtime dependencies, built-in search with SVG element highlighting, responsive navigation, and theme customization.

---

## Key Features

- **Native Wikilinks (`[[str]]` and `[[str|alias]]`)**: 4-pass fuzzy heading resolver (exact, normalized, prefix/substring, Levenshtein edit distance) and adjacent asset resolution.
- **Embedded Diagram DSL (` ```diagram `)**: Declarative flowchart syntax compiled directly into responsive SVG nodes with title/subtitle splits and search highlighting.
- **Embedded Table DSL (` ```table `)**: GFM pipe table syntax rendered as interactive SVGs with custom headers and search match synchronization.
- **Self-Contained & Split Distribution**: Output as a single standalone HTML file (`--single`) with base64 assets and inlined styles/scripts, or a modular directory (`--split`).
- **Interactive Search & Navigation**: Pre-rendered SVGs participate directly in document search and table-of-contents navigation.

---

## Compilation Architecture

```diagram 
TITLE: Markdown++ Compilation Pipeline 

INPUT["Input .mdd Document — Source file with frontmatter, wikilinks, diagrams & tables"]

FRONT["Frontmatter Parser — Extracts title, accent, assets_dir & styling options"]

LEX["Lexer & Tokenizer — markdown-it core tokens, wikilink & fence rules"]

RESOLVE["Fuzzy Link & Asset Resolver — 4-pass heading matching + assets directory scan"]

RENDER["Renderer — GFM to HTML, diagram & table ASTs to SVG"]

ASSEMBLE["Output Assembler — Inlines/links scripts, styles, base64 images into shell"]

OUTPUT["HTML Output — Standalone single-file or split distribution"]

INPUT --> FRONT
FRONT --> LEX
LEX --> RESOLVE
RESOLVE --> RENDER
RENDER --> ASSEMBLE
ASSEMBLE --> OUTPUT
```

---

## Installation & Quick Start

### Global Installation / Link

```powershell
npm install -g markdowndown
```

Or run directly with `npx`:

```powershell
npx markdowndown input.mdd --single -o output.html
```

### Fast CLI Alias

```powershell
mdd input.mdd -o dist/
```

---

## CLI Usage

Markdown++ provides `mdd` and `markdowndown` CLI binaries:

```powershell
mdd <input.mdd> [options]
```

```table
TITLE: Markdown++ CLI Options
| Flag | Type | Description |
| -o, --output <path> | string | Output file (when --single) or directory (when --split) |
| --single | flag | Emit single self-contained HTML file with inlined assets (default: true) |
| --split | flag | Emit modular folder with separate HTML, CSS, JS, and assets (default: false) |
| --assets-dir <path> | string | Custom assets directory for wikilink asset resolution |
| --no-diagrams | flag | Skip rendering diagram fences to SVG |
| --no-tables | flag | Skip rendering table fences to SVG |
| --minify | flag | Minify CSS/JS/HTML in monolithic export (default: true) |
| --no-minify | flag | Disable minification in monolithic export |
| -L, --logo [path] | string/flag | Custom brand logo and dynamic favicon (auto-detects if single .svg exists) |
| -F, --force | flag | Force overwrite without confirmation prompt |
| -v, --verbose | flag | Enable verbose compiler logging |
| --spec | flag | Print the full MD++ language specification and exit |
| -V, --version | flag | Output the version number |
| -h, --help | flag | Display CLI help and options |
```

### Examples

**Compile to a single self-contained HTML page:**
```powershell
mdd docs/spec.mdd --single -o dist/spec.html
```

**Compile to a split directory structure:**
```powershell
mdd docs/spec.mdd --split -o dist/spec-site/
```

---

## Syntax Reference

### YAML Frontmatter

Documents can start with an optional YAML block delimited by `---`:

```yaml
---
title: "System Architecture Specification"
accent: "#2563eb"
theme: "dark" # or "light"
bg_lum: "0.0 : 0.95" # or bg_lum: { dark: 0.0, light: 0.95 }
assets_dir: "./assets"
custom_css: "./theme.css"
custom_js: "./analytics.js"
---
```

### Wikilinks & Heading Resolution

Wikilinks link directly to headings or local assets:

- **Self-referencing link**: `[[Architecture]]` (resolves to heading matching `Architecture`)
- **Aliased link**: `[[Architecture|System Layout]]`
- **Asset link**: `[[diagram.png]]` or `[[figures/flow.svg]]`
- **Escaping**: `\[[literal]]` or `` `[[code]]` ``

The resolver operates in 4 passes against headings:
1. **Exact match**: Case-sensitive match.
2. **Normalized match**: Case-insensitive with normalized whitespace and punctuation stripped.
3. **Substring match**: Prefix or containment matching.
4. **Levenshtein distance**: Fuzzy typo tolerance based on length threshold.

### Diagram DSL

Fenced code block with `diagram`:

````markdown
```diagram LR
TITLE: Authentication Flow
CLIENT["Client App — Browser / Mobile"]
GATEWAY["API Gateway — Rate limiting & TLS"]
AUTH["Auth Service — JWT validation"]
CLIENT -->|HTTPS Request| GATEWAY
GATEWAY -->|Validate Token| AUTH
```
````

- **Fence Direction Argument**: Declare direction directly on the fence info string: ` ```diagram LR `, ` ```diagram TB `, ` ```diagram RL `, ` ```diagram BT `.
- **Zero-Boilerplate Auto-Layout**: Omit direction (` ```diagram `) to use intelligent dynamic auto-layout.
- **In-Body Direction**: Bare `LR` / `TB` or directive `DIRECTION: LR` also supported.
- **Node Shapes**: `[Rectangle]` (default), `(Rounded)`, `{Diamond}`.
- **Title–Subtitle Split**: `["Title — Subtitle"]` uses em-dash ` — ` to format primary and secondary labels.
- **Edge Types**: Directed `-->`, undirected `---`, and labeled `-->|label|`.

### Table DSL

Fenced code block with `table`:

````markdown
```table
TITLE: Benchmark Results
| Engine | Latency (p95) | Memory Usage |
| Markdown++ | 12ms | 24MB |
| Standard AST | 45ms | 86MB |
```
````

### Callout Alerts (`[!]` & `[!STRING]`)

Blockquotes starting with `[!]` or `[!<identifier>]` render as unified callout boxes using the document's accent theme:

```markdown
> [!]
> Highlighted callout without a header title

> [!NOTE]
> Information callout with a header title

> [!SYNTHESIS]
> Custom arbitrary callout header
```

- **Bare Highlight `[!]`**: Highlighted callout box without a header.
- **String-Agnostic `[!STRING]`**: Any identifier is accepted (`[!NOTE]`, `[!TIP]`, `[!WARNING]`, `[!INSIGHT]`, etc.) and rendered as the title.
- **Unified Accent Styling**: Color-agnostic design matching the document's `--accent` palette.

---

## Development & Testing

Clone the repository and install dependencies:

```powershell
npm install
```

### Available Scripts

- **Test Suite**:
  ```powershell
  npm test
  ```
- **Type Checking**:
  ```powershell
  npm run typecheck
  ```
- **Linting**:
  ```powershell
  npm run lint
  ```
- **Build Distribution**:
  ```powershell
  npm run build
  ```

---

## License

MIT License.
