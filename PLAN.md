# Markdown++ — Comprehensive Plan

## 1. Overview

Transform the monolithic `scratch/CLDS_interactive_v15.html` into a CLI tool that converts
any `.mdd` file into an interactive HTML document with TOC, theme system, full-text search,
and SVG-rendered diagrams and tables.

`markdown++` is standard GitHub-Flavored Markdown extended with two inline constructs and
two fenced code block languages. Everything else is GFM.

**File extension:** `.mdd`

---

## 2. Markdown++ Specification

### 2.1 YAML Frontmatter (optional)

```yaml
---
title: "Document Title"         # fallback: .mdd filename
author: "Author Name"
assets_dir: "./assets"          # default: ./assets/ relative to .mdd file
accent: "#3b82f6"               # default accent color
custom_css: "./extras.css"      # optional extra CSS (inlined in output)
custom_js: "./extras.js"        # optional extra JS (inlined in output)
---
```

Delimited by `---` fences. All keys optional. Parser ignores unknown keys.

### 2.2 Inline Extension: Wikilinks `[[str]]`

| Form | Meaning |
|------|---------|
| `[[str]]` | Self-referencing link. Display text = `str`. |
| `[[str\|display]]` | Aliased link. Resolves `str`, displays `display`. |
| `\[[str]]` | Escaped. Renders as literal `[[str]]`. |

Inside fenced code blocks and inline code, `[[str]]` is always literal
(markdown-it handles this natively).

**Resolution order (first match wins):**

1. **Heading match** — `str` is run through the 4-pass fuzzy heading resolver.
   If a unique match is found → `<a href="#slug">display</a>`.

2. **File match** — `str` is checked against the adjacent assets directory:
   - No extension → probe `.png`, `.jpg`, `.jpeg`, `.svg`, `.gif`, `.webp`,
     `.mp4`, `.webm`, `.mdd`, `.md` in that order.
   - Has extension → exact basename match.
   - Subdirectory paths allowed: `[[subdir/image.png]]`.
   - Matched `.mdd` or `.md` → `<a href="path/to/file.mdd">display</a>`.
   - Matched image/video → `<img>` tag (base64 inlined in `--single`,
     relative `src` in `--split`).

3. **Collision** — >1 match at any step → compiler error, stderr, exit 1.
   No silent guessing.

4. **Not found** — Neither heading nor file matches → compiler error.

### 2.3 Fenced Code Block: `diagram`

````markdown
```diagram
TITLE: Diagram Title
flowchart TB
  NODE_A["Title — Subtitle"]
  NODE_B["Another node"]
  NODE_A -->|edge label| NODE_B
  NODE_B --- NODE_C
```
````

**`TITLE:` directive:** Optional first-line metadata. Used as `data-title` and
`aria-label`. If omitted, falls back to the `.mdd` filename.

**Grammar:**

```
diagram      := [header] (node_def | edge_def | comment)*
header       := ("flowchart" | "graph") direction
direction    := "TB" | "TD" | "BT" | "RL" | "LR"
node_def     := NODE_ID ["[" label "]" | "(" label ")" | "{" label "}"]
edge_def     := node_ref arrow node_ref
arrow        := "-->" | "---" | "-->" "|" label "|" | "--" label "-->"
node_ref     := NODE_ID | node_def
NODE_ID      := [A-Za-z0-9_.\-]+
label        := [^\n]+ (trimmed)
comment      := "%%" [^\n]* (stripped, ignored)
```

**Node shapes:**
- `[text]` → rectangle (default)
- `(text)` → rounded rectangle
- `{text}` → diamond/rhombus (decisions, conditions)

**Edge types:**
- `-->` directed arrow
- `---` undirected line
- Labels: `-->|label|` or `-- label -->`

**Layout:**
- `TB`/`TD` → top-to-bottom (default)
- `LR`/`RL` → left-to-right
- `BT` → bottom-to-top (reversed rank order)

The ` — ` (em-dash) inside a node label splits title from subtitle for
visual rendering (title bold, subtitle lighter).

### 2.4 Fenced Code Block: `table`

````markdown
```table
TITLE: Table Title
| Column A | Column B | Column C |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |
```
````

**Grammar:**

```
table        := [title_directive] header_row separator data_rows*
title_directive := "TITLE:" text
header_row   := "|" cell ("|" cell)* ["|"]
separator    := "|"? ("-" | ":") ("-" | ":")+ ("|" ("-" | ":")+)* ["|"]
data_rows    := "|" cell ("|" cell)* ["|"]
cell         := [^\|]*
```

Standard GFM pipe-table syntax. Separator-row alignment markers (`:---`,
`:---:`, `---:`) are parsed but ignored — all cells render left-aligned.

### 2.5 Fuzzy Heading Resolver

Given `str` from `[[str]]`, resolve against all `h1`–`h6` headings in the
document. Each heading has `{text, id}` where `id` is markdown-it's slug
(lowercase, hyphens, non-alphanumeric stripped — same as GFM anchors).

**Pass 1 — Exact:**
Case-sensitive, whitespace-exact: `str === heading.text`.

**Pass 2 — Normalized:**
`norm(s) = s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim()`
Compare `norm(str) === norm(heading.text)`.

**Pass 3 — Substring:**
3a. `norm(str)` starts with `norm(heading.text)` or vice versa (prefix).
3b. `norm(str)` contains `norm(heading.text)` or vice versa (substring).
Union all matches. If >1 → collision.

**Pass 4 — Levenshtein:**
Compute edit distance between `norm(str)` and each `norm(heading.text)`.
Accept the closest match if `distance <= max(2, floor(len(norm(heading.text)) * 0.3))`.
Ties at same minimum distance → collision.

**Ambiguity error format:**
```
ERROR: [[str]] is ambiguous — matched N headings:
  1. "Heading One" (pass: exact-normalized)
  2. "Heading Two" (pass: Levenshtein d=1)
Resolve to a unique string or use the full heading text.
```

### 2.6 Escaping

- `\[[str]]` → literal `[[str]]`
- Inside `` `inline code` `` → literal
- Inside fenced code blocks → literal
- Standard GFM backslash escapes apply for all other Markdown syntax

---

## 3. Tech Stack

| Concern | Choice |
|---------|--------|
| Runtime | Node.js + TypeScript |
| Markdown parser | `markdown-it` (extensible, plugin ecosystem) |
| CLI | `commander` |
| Fuzzy heading solver | Custom multi-pass algorithm (§2.5) |
| Diagram renderer | Port from `scratch/CLDS_interactive_v15.html` |
| Table renderer | Port from `scratch/CLDS_interactive_v15.html` |
| Tests | Playwright (existing pattern) |
| Dev runner | `tsx` |
| Production build | `esbuild` |

---

## 4. Directory Structure

```
Markdown++/
├── src/
│   ├── cli.ts                    # CLI entry point (commander)
│   ├── compile.ts                # Pipeline orchestrator: lex → resolve → render → assemble
│   ├── parser/
│   │   ├── markdown.ts           # markdown-it setup + plugin registration
│   │   ├── wikilink.ts           # [[str]] inline rule → token
│   │   ├── diagram.ts            # ```diagram fence → code block token
│   │   └── table.ts              # ```table fence → code block token
│   ├── resolver/
│   │   ├── heading.ts            # Heading extractor + 4-pass fuzzy match
│   │   ├── asset.ts              # Adjacent dir scanner + file resolver
│   │   └── collision.ts          # Ambiguity detection + error reporting
│   ├── renderer/
│   │   ├── template.ts           # HTML shell assembly (body into skeleton)
│   │   ├── css.ts                # Parameterized CSS (theme, layout, sidebar, etc.)
│   │   ├── js.ts                 # Parameterized JS (theme, TOC, search, etc.)
│   │   ├── diagram-svg.ts        # Diagram DSL → SVG string
│   │   └── table-svg.ts          # Pipe-table → SVG string
│   └── types.ts                  # Shared types
├── templates/
│   └── shell.html                # HTML skeleton with {{placeholders}}
├── tests/
│   ├── heading-match.test.ts     # Fuzzy resolver unit tests
│   ├── wikilink-resolve.test.ts  # End-to-end wikilink resolution
│   ├── collision-detect.test.ts  # Collision detection tests
│   ├── diagram-render.test.ts    # Diagram DSL → SVG output tests
│   ├── table-render.test.ts      # Table DSL → SVG output tests
│   ├── end-to-end.test.ts        # Full pipeline tests (Playwright)
│   └── fixtures/                 # Sample .mdd files + expected output
├── scratch/                      # Existing (gitignored, preserved as-is)
├── package.json
├── tsconfig.json
└── PLAN.md
```

---

## 5. Processing Pipeline

```
  input.mdd
      │
      ▼
  ┌──────────────┐
  │  1. FRONTMATTER │  Parse YAML frontmatter → Options
  └──────┬───────┘
         │
         ▼
  ┌──────────────┐
  │  2. LEX      │  markdown-it tokenization
  │              │  + wikilink inline rule
  │              │  + diagram/table fence rules
  └──────┬───────┘
         │
         ▼
  ┌──────────────┐
  │  3. RESOLVE  │  Extract headings from tokens
  │              │  Scan adjacent assets dir
  │              │  Resolve each [[str]] → #slug or file path
  │              │  Detect collisions → fail with error
  └──────┬───────┘
         │
         ▼
  ┌──────────────┐
  │  4. RENDER   │  markdown-it → HTML body
  │              │  diagram code blocks → SVG
  │              │  table code blocks → SVG
  │              │  [[str]] tokens → <a> or <img> tags
  └──────┬───────┘
         │
         ▼
  ┌──────────────┐
  │  5. ASSEMBLE │  Inject body into shell.html
  │              │  Inline CSS/JS (--single) or link (--split)
  │              │  Base64-encode images (--single)
  │              │  Copy assets (--split)
  └──────┬───────┘
         │
         ▼
  output/
```

---

## 6. CLI Interface

```
markdown++ <input.mdd> [options]

Options:
  -o, --output <path>       Output file or directory
                            (default: input basename + .html)
  --single                  Single self-contained HTML (all inlined)
  --split                   Separate CSS/JS/assets (default)
  --assets-dir <path>       Assets directory (default: ./assets/)
  --no-diagrams             Skip diagram SVG rendering
  --no-tables               Skip table SVG rendering
  -v, --verbose             Verbose output
  -h, --help                Show help

Exit codes:
  0  Success
  1  Compilation error (parse failure, unresolved reference, collision)
```

---

## 7. Output Modes

### 7.1 `--split` (default)

```
output/
├── CLDS.html           # HTML with <link rel="stylesheet" href="style.css">
│                       #         and <script src="app.js">
├── style.css           # All CSS
├── app.js              # All JS (themes, TOC, diagrams, tables, search)
└── assets/             # Copied from input assets dir (if present)
```

### 7.2 `--single`

```
output/
└── CLDS.html           # Everything inline:
                        #   <style>...</style>
                        #   <script>...</script>
                        #   <img src="data:image/png;base64,...">
```

CSS injected as `<style>`, JS as `<script>`, images base64-encoded inline.
Linked `.mdd`/`.md` files remain as `href` references (not inlined).

---

## 8. HTML Template

The shell template (`templates/shell.html`) produces the same interactive
document structure as `CLDS_interactive_v15.html`:

```
<!doctype html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{{title}}</title>
  <style>{{css}}</style>            <!-- or <link> in --split mode -->
</head>
<body>
  <!-- Brand SVG logo (inline) -->
  <header class="topbar">
    <!-- Search box, theme toggle, accent settings -->
  </header>

  <div class="settings" id="settings">
    <!-- Accent color picker + swatches -->
  </div>

  <div class="layout">
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-title">Contents</div>
      <ul class="toc" id="toc"></ul>   <!-- JS auto-populates from headings -->
    </aside>
    <main class="main">
      <article class="article" id="article">
        <section class="hero">
          <div class="kicker">{{subtitle}}</div>
          <h1>{{title}}</h1>
          <p>{{description}}</p>
          <div class="meta">{{pills}}</div>
        </section>
        {{body}}                        <!-- markdown-it output -->
      </article>
    </main>
  </div>

  <script>{{js}}</script>             <!-- or <script src> in --split mode -->
</body>
</html>
```

The `{{body}}` contains the full markdown-rendered article with:
- `<div class="code-wrap diagram" data-title="...">` for diagram blocks
- `<div class="code-wrap table" data-title="...">` for table blocks
- `<a href="#slug">` for wikilink section refs
- `<img src="...">` or `<a href="...">` for wikilink file refs

---

## 9. CLDS → First Test Case (Migration Path)

The existing `scratch/CLDS_interactive_v15.html` becomes the golden reference.

### Steps:

1. **Extract CSS** from lines 8–408 into `src/renderer/css.ts` as a template
   literal parameterized by `accent` color and `theme`.

2. **Extract JS** from lines 2423–3674 into `src/renderer/js.ts` as a template
   literal. Remove CLDS-specific title references; parameterize the
   `faviconTemplate` accent substitution.

3. **Extract diagram renderer** — port `diagramParse`/`diagramLayout`/
   `diagramBuildSvg`/`diagramTextWidth`/`diagramWrap` (lines 2790–3109)
   into `src/renderer/diagram-svg.ts`. Same logic, TypeScript types,
   no DOM dependency (measures text width via canvas).

4. **Extract table renderer** — port `tableParse`/`tableBuildSvg` (lines
   3187–3283) into `src/renderer/table-svg.ts`.

5. **Extract shell HTML** — the topbar, sidebar, settings, hero section
   (lines 401–470) into `templates/shell.html` with `{{placeholders}}`.

6. **Create `CLDS.mdd`** — the article content (lines 472–2416) converted
   back to Markdown. Diagram/table code blocks get ` ```diagram ` /
   ` ```table ` fences with `TITLE:` directives. Where appropriate, add
   `[[str]]` wikilinks for internal section references.

7. **Verify:** `markdown++ CLDS.mdd --single` should produce output that is
   functionally equivalent to `CLDS_interactive_v15.html` (same interactive
   features, same visual output, same search/diagram/table behavior).

---

## 10. Build Milestones

| # | Milestone | Files | Depends on |
|---|-----------|-------|------------|
| 1 | **Project scaffold** | `package.json`, `tsconfig.json`, directory creation, empty barrel exports | — |
| 2 | **Types** | `src/types.ts` — `Options`, `Heading`, `Asset`, `Resolution`, `CompileResult` | — |
| 3 | **Heading resolver** | `src/resolver/heading.ts` + `tests/heading-match.test.ts` | 2 |
| 4 | **Wikilink parser** | `src/parser/wikilink.ts` — markdown-it inline rule producing `[[str]]` tokens | 2 |
| 5 | **Asset resolver** | `src/resolver/asset.ts` + `tests/asset-resolve.test.ts` | 2 |
| 6 | **Collision engine** | `src/resolver/collision.ts` + `tests/collision-detect.test.ts` | 3,5 |
| 7 | **Diagram renderer** | `src/renderer/diagram-svg.ts` + `tests/diagram-render.test.ts` | 2 |
| 8 | **Table renderer** | `src/renderer/table-svg.ts` + `tests/table-render.test.ts` | 2 |
| 9 | **CSS module** | `src/renderer/css.ts` — parameterized CSS string | — |
| 10 | **JS module** | `src/renderer/js.ts` — parameterized JS string (no DOM deps) | — |
| 11 | **HTML template** | `templates/shell.html` + `src/renderer/template.ts` | 9,10 |
| 12 | **Markdown++ parser** | `src/parser/markdown.ts` — wire markdown-it + wikilink + diagram/table fences | 4,7,8 |
| 13 | **Frontmatter parser** | `src/parser/frontmatter.ts` — YAML frontmatter → Options | 2 |
| 14 | **Pipeline assembly** | `src/compile.ts` — full pipeline: frontmatter → lex → resolve → render → assemble | 6,11,12,13 |
| 15 | **CLI entry point** | `src/cli.ts` — commander setup, file I/O, error handling | 14 |
| 16 | **CLDS golden test** | Create `CLDS.mdd`, compile, functional equivalence check | 15 |
| 17 | **End-to-end tests** | Playwright tests on generated HTML (TOC, search, themes, diagrams, tables) | 16 |
| 18 | **Production build** | `esbuild` config, output bundle, `bin` entry in package.json | 15 |

---

## 11. Design Decisions Log

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Title fallback: `TITLE:` → `.mdd` filename | Simplest, no magic |
| D2 | Table alignment: always left | Simplest wins |
| D3 | Fence languages: `diagram` and `table` only | Our spec, no backward compat |
| D4 | Diamond nodes `{text}` in v1 | Trivial to add |
| D5 | Error format: stderr + exit 1 | No JSON output for now |
| D6 | Watch mode: dropped | Equivalent to `npx http-server` + manual rebuild |
| D7 | Runtime: Node.js + TypeScript | Rich ecosystem, existing test patterns |
| D8 | Parser: `markdown-it` | Most extensible JS Markdown parser |
| D9 | Single-file default: `--split` | Keeps output portable and debuggable |
| D10 | Image handling: base64 in `--single` | Self-contained output |
| D11 | Cross-doc links: `href` only, no recursive compile | Build-system concern |
| D12 | Only images + .mdd/.md for `[[str]]` file refs | Scoped for v1 |
