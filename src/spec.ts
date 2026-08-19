/**
 * Full MD++ language specification, embedded for `mdd --spec` output.
 * Consolidates SPEC.md + DSL.md + README syntax reference into one document.
 */
export const SPEC = `
# Markdown++ (MD++) Full Language Specification

**Version:** 1.0
**File extension:** \`.mdd\` (also accepts \`.md\` / \`.markdown\`)
**Package name:** \`markdowndown\` — CLI binaries: \`mdd\`, \`markdowndown\`

---

## 1. Overview

Markdown++ is standard GitHub-Flavored Markdown (GFM) extended with:

- **Wikilinks** — inline \`[[target]]\` and \`[[target|display]]\` constructs
- **Diagram DSL** — \` \`\`\`diagram \` fenced code blocks compiled to interactive SVG
- **Table DSL** — \` \`\`\`table \` fenced code blocks rendered as interactive SVG
- **YAML Frontmatter** — optional \`---\\n...\\n---\` metadata block

Everything else is plain GFM. No other custom syntax exists.

---

## 2. CLI Interface

### Usage

\`\`\`
mdd <input.mdd> [options]
mdd --spec
\`\`\`

### Options

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| \`<input>\` | argument | (required) | Input \`.mdd\` or \`.md\` file to compile |
| \`-o, --output <path>\` | string | auto | Output file (\`--single\`) or directory (\`--split\`) |
| \`--single\` | flag | true | Single self-contained HTML with inlined assets |
| \`--split\` | flag | false | Separate CSS/JS/assets directory structure |
| \`--assets-dir <path>\` | string | \`./assets/\` | Assets directory for wikilink file resolution |
| \`--no-diagrams\` | flag | false | Skip diagram SVG rendering |
| \`--no-tables\` | flag | false | Skip table SVG rendering |
| \`--minify\` | flag | true | Minify CSS/JS/HTML in monolithic export |
| \`--no-minify\` | flag | false | Disable minification |
| \`-L, --logo <path>\` | string | (none) | Custom SVG or image brand logo and dynamic favicon |
| \`-F, --force\` | flag | false | Force overwrite without confirmation prompt |
| \`-v, --verbose\` | flag | false | Verbose output |
| \`--spec\` | flag | false | Print this specification to stdout and exit |
| \`-V, --version\` | flag | — | Output version number |
| \`-h, --help\` | flag | — | Display help |

### Exit Codes

- \`0\` — Success
- \`1\` — Compilation error, input not found, or unresolved reference

---

## 3. YAML Frontmatter (optional)

Delimited by \`---\\n\` fences at the start of the document.

\`\`\`yaml
---
title: "Document Title"
author: "Author Name"
accent: "#3b82f6"
logo: "./assets/logo.svg"
assets_dir: "./assets"
custom_css: "./extras.css"
custom_js: "./extras.js"
kicker: "Kicker text"
subtitle: "Subtitle text"
pills:
  - "Tag One"
  - "Tag Two"
---
\`\`\`

### Keys

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| \`title\` | string | \`.mdd\` filename stem | Document title. Injected into \`<title>\`, topbar brand, and hero. |
| \`author\` | string | (none) | Author name. Informational only. |
| \`accent\` | string | \`#3b82f6\` | Hex accent color. Drives CSS custom properties and SVG fills. |
| \`logo\` | string | (none) | Path to custom brand logo SVG or image. Used for navbar and dynamic favicon. |
| \`assets_dir\` | string | \`./assets/\` relative to \`.mdd\` | Directory to scan for wikilink file resolution. |
| \`custom_css\` | string | (none) | Path to extra CSS file. Inlined in output. |
| \`custom_js\` | string | (none) | Path to extra JS file. Inlined in output. |
| \`kicker\` | string | (none) | Hero section kicker text (small label above title). |
| \`subtitle\` | string | (none) | Hero section subtitle. |
| \`pills\` | string[] | (none) | Hero section badge/tag array. |

All keys are optional. Unknown keys are ignored. Frontmatter values override CLI defaults.

Path values (\`assets_dir\`, \`custom_css\`, \`custom_js\`) are resolved relative to the input file directory.

---

## 4. Wikilinks

### 4.1 Syntax

| Form | Meaning |
|------|---------|
| \`[[target]]\` | Self-referencing link. Display text = \`target\`. |
| \`[[target\\|display]]\` | Aliased link. Resolves \`target\`, displays \`display\`. |
| \`\\[[target]]\` | Escaped. Renders as literal \`[[target]]\`. |

Inside fenced code blocks and inline code, \`[[target]]\` is always literal (markdown-it handles this natively).

### 4.2 Resolution Order (first match wins)

**Step 0 — Extension fast-path:**
If \`target\` contains a \`.\` (looks like a filename with an extension), heading resolution is **skipped entirely** and the resolver jumps directly to step 2 (file match). This is unambiguous: \`[[logo.png]]\` always means the file, never a heading named "logo.png".

**Step 1 — Heading match** (only when \`target\` has no extension):
\`target\` is run through the 4-pass fuzzy heading resolver (§4.3). If a unique match is found → \`<a href="#slug">display</a>\`.

Heading-first is intentional. When \`target\` has no extension, headings take priority over same-named files. A user with a heading "Logo" and an asset \`logo.png\` who writes \`[[logo]]\` gets the heading. To link the image they must write \`[[logo.png]]\`.

**Step 2 — File match:**
\`target\` is checked against the adjacent assets directory:
- No extension → probe \`.png\`, \`.jpg\`, \`.jpeg\`, \`.svg\`, \`.gif\`, \`.webp\`, \`.mp4\`, \`.webm\`, \`.mdd\`, \`.md\` in that order.
- Has extension → exact basename match.
- Subdirectory paths allowed: \`[[subdir/image.png]]\`.
- Matched \`.mdd\` or \`.md\` → \`<a href="path/to/file.mdd">display</a>\`.
- Matched image/video → \`<img>\` tag (base64 inlined in \`--single\`, relative \`src\` in \`--split\`).

**Step 3 — Collision:**
>1 match at any step → compiler error, stderr, exit 1. No silent guessing. Cross-step collisions are not raised; the priority order is definitive.

**Step 4 — Not found:**
Neither heading nor file matches → compiler error.

### 4.3 Fuzzy Heading Resolver (4 passes)

Given \`target\` from \`[[target]]\`, resolve against all \`h1\`–\`h6\` headings in the document. Each heading has \`{text, id}\` where \`id\` is markdown-it's slug.

**Pass 1 — Exact:**
Case-sensitive, whitespace-exact: \`target === heading.text\`.

**Pass 2 — Normalized:**
\`\`\`
norm(s) = s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\\s+/g, " ").trim()
\`\`\`
Compare \`norm(target) === norm(heading.text)\`.

**Pass 3 — Substring:**
- 3a. \`norm(target)\` starts with \`norm(heading.text)\` or vice versa (prefix).
- 3b. \`norm(target)\` contains \`norm(heading.text)\` or vice versa (substring).
- Union all matches. If >1 → collision.

**Pass 4 — Levenshtein:**
Compute edit distance between \`norm(target)\` and each \`norm(heading.text)\`. Accept the closest match if \`distance <= max(2, floor(len(norm(heading.text)) * 0.3))\`. Ties at same minimum distance → collision.

### 4.4 Ambiguity Error Format

\`\`\`
ERROR: [[target]] is ambiguous — matched N headings:
  1. "Heading One" (pass: exact-normalized)
  2. "Heading Two" (pass: Levenshtein d=1)
Resolve to a unique string or use the full heading text.
\`\`\`

---

## 5. Escaping

- \`\\[[target]]\` → literal \`[[target]]\`
- Inside \`inline code\` → literal
- Inside fenced code blocks → literal
- Standard GFM backslash escapes apply for all other Markdown syntax

---

## 6. Heading ID Generation

All headings (\`h1\`–\`h6\`) receive an \`id\` attribute for anchor linking and wikilink resolution. The slug is generated by:

\`\`\`
slugify(text) = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
\`\`\`

This matches GFM anchor behavior. Example: \`## Part I: The Two Regimes\` → \`id="part-i-the-two-regimes"\`.

### 6.1 Item / Glossary Headings

Headings starting with a bullet marker (\`*\`, \`-\`, or \`•\`) are treated as **Item / Glossary Headings**:

\`\`\`markdown
### Doctrine & State Theory

#### * Romanism
The doctrine of state-directed, militarized internal colonization.

#### * Liquidation
Systematic dissolution of national sovereignty and civilizational capacity.
\`\`\`

- **ID Generation**: The leading bullet marker is automatically stripped from the slug (\`#### * Romanism\` generates \`id="romanism"\`). Wikilinks resolve directly as \`[[Romanism]]\` or \`[[romanism]]\`.
- **TOC & Main Content Styling**: Renders with an accent bullet dot (\`•\`) in both the sidebar TOC and the document body. The heading text is cleanly aligned and coupled tightly with its following definition paragraph.

---

## 7. Diagram DSL

### 7.1 Syntax

\`\`\`
\` \`\` \`diagram LR
TITLE: Diagram Title
NODE_A["Title — Subtitle"]
NODE_B["Another node"]
NODE_A -->|edge label| NODE_B
NODE_B --- NODE_C
\` \`\` \`
\`\`\`

### 7.2 Grammar

\`\`\`
diagram      := "\`\`\`diagram" [direction] [title_dir] [dir_spec] (node_def | edge_def | comment)* "\`\`\`"
direction    := "TB" | "TD" | "BT" | "LR" | "RL" | "auto"
title_dir    := "TITLE:" text
dir_spec     := ("DIRECTION:"? direction) | (("flowchart"|"graph") direction?)
node_def     := NODE_ID ["[" label "]" | "(" label ")" | "{" label "}"]
edge_def     := node_ref arrow node_ref [ "|" label "|" ]
arrow        := "-->" | "---"
node_ref     := NODE_ID | node_def
NODE_ID      := [A-Za-z0-9_.\\-]+
label        := [^\\n]+ (trimmed)
comment      := "%%" [^\\n]* (stripped, ignored)
\`\`\`

### 7.3 Directives & Flow Direction

- **Fence Direction Argument**: Optional direction on the fence info string: \` \`\`\`diagram LR \`, \` \`\`\`diagram TB \`, \` \`\`\`diagram RL \`, \` \`\`\`diagram BT \`.
- **TITLE Directive**: Optional first-line metadata \`TITLE: <text>\`. Injected as \`data-title\` and SVG \`aria-label\`.
- **Direction In-Body**: Can also be specified inside the body as a bare token (e.g. \`LR\`) or directive \`DIRECTION: LR\`. If omitted, defaults to smart dynamic auto-layout.

### 7.4 Node Shapes

| Syntax | Shape | Use Case |
|--------|-------|----------|
| \`[text]\` | Rectangle (sharp corners) | Default. States, layers, artifacts. |
| \`(text)\` | Rounded rectangle (\`rx=18\`) | Processes, protocols, frameworks. |
| \`{text}\` | Diamond/rhombus | Decisions, conditions, branches. |

If no shape delimiter is provided, the node defaults to \`[text]\` (rectangle).

### 7.5 Edge Types

| Syntax | Meaning |
|--------|---------|
| \`-->\` | Directed arrow (with arrowhead marker) |
| \`---\` | Undirected line (no arrowhead) |
| \`-->|label|\` | Directed arrow with edge label |

### 7.6 Directions

| Value | Flow Direction |
|-------|---------------|
| \`TB\` / \`TD\` | Top to bottom |
| \`LR\` | Left to right |
| \`RL\` | Right to left |
| \`BT\` | Bottom to top (reversed rank order) |
| \`auto\` (default) | Smart dynamic layout — switches to TB if too wide |

### 7.7 Title-Subtitle Split

The \` — \` (em-dash, U+2014, with surrounding spaces) inside a node label splits the content into **title** (bold, accent color) and **subtitle** (lighter weight, muted color).

Example: \`["SPECIFICATION LAYER — DIEGETICS.md / README"]\` renders "SPECIFICATION LAYER" as the title and "DIEGETICS.md / README" as the subtitle.

If no em-dash is present, the entire text is rendered as the title.

### 7.8 Text Wrapping

Long labels are word-wrapped to fit within the node width. Text width is estimated using a constant \`CHAR_WIDTH_PX\` (7.4px per character at font-size 12px). Node width is determined by the longest line after wrapping, plus padding.

### 7.9 Layout Algorithm

1. **Parse** — Extract nodes and edges from the DSL.
2. **Rank** — Assign vertical (or horizontal) ranks based on edge direction. Uses longest-path ranking from a virtual root.
3. **Order** — Within each rank, minimize edge crossings using median ordering.
4. **Position** — Compute (x, y) coordinates with fixed vertical spacing (\`RANK_SEP = 130px\`) and node padding.
5. **Auto** — If too wide or too many nodes/ranks, switches to TB layout.
6. **Render** — Emit SVG with \`<rect>\`, \`<text>\`, \`<line>\`/\`<path>\`, and \`<marker>\` elements.

### 7.10 SVG Output Classes

| Class | Element | Purpose |
|-------|---------|---------|
| \`diagram-svg\` | \`<svg>\` | Root container |
| \`node-group\` | \`<g>\` | Groups a node's rect + text |
| \`node-bg\` | \`<rect>\` | Node background |
| \`node-rect\` | \`<rect>\` | Node background (interactive states) |
| \`node-title\` | \`<text>\` | Title text (bold, accent color) |
| \`node-sub\` | \`<text>\` | Subtitle text (muted) |
| \`edge-line\` | \`<line>\` | Edge connector |
| \`edge-path\` | \`<path>\` | Edge connector (curved) |
| \`edge-label\` | \`<text>\` | Edge label text |
| \`is-hit\` | modifier | Matched during search |
| \`is-current\` | modifier | Current search match |

---

## 8. Table DSL

### 8.1 Syntax

\`\`\`
\` \`\` \`table
TITLE: Table Title
| Column A | Column B | Column C |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |
\` \`\` \`
\`\`\`

### 8.2 Grammar

\`\`\`
table           := [title_directive] header_row separator data_rows*
title_directive := "TITLE:" text
header_row      := "|" cell ("|" cell)* ["|"]
separator       := "|"? ("-" | ":") ("-" | ":")+ ("|" ("-" | ":")+)* ["|"]
data_rows       := "|" cell ("|" cell)* ["|"]
cell            := [^\\|]*
\`\`\`

Standard GFM pipe-table syntax. Separator-row alignment markers (\`:---\`, \`:---:\`, \`---:\`) are parsed but ignored — all cells render left-aligned.

### 8.3 TITLE Directive

Same as \`diagram\` (§7.2). Optional first-line \`TITLE: <text>\`.

### 8.4 Layout

- Column widths are determined by the longest cell content in each column, plus padding.
- Row heights are fixed (30px for data rows, 34px for header rows).
- The header row gets a distinct background (accent-tinted surface).
- Cell padding: 12px horizontal, vertical centering.

### 8.5 SVG Output Classes

| Class | Element | Purpose |
|-------|---------|---------|
| \`table-svg\` | \`<svg>\` | Root container |
| \`tcell\` | \`<g>\` | Groups a cell's rect + text |
| \`tbl-head-bg\` | \`<rect>\` | Header cell background |
| \`tbl-cell-bg\` | \`<rect>\` | Data cell background |
| \`tbl-head-text\` | \`<text>\` | Header cell text (bold, accent) |
| \`tbl-cell-text\` | \`<text>\` | Data cell text |
| \`tbl-grid\` | \`<line>\` | Cell border grid |
| \`is-hit\` | modifier | Matched during search |
| \`is-current\` | modifier | Current search match |

---

## 9. Shared Rendering Rules

### 9.1 Copy Button

Each \`diagram\` and \`table\` block gets a \`<button class="copy-btn">\` that copies the raw DSL source to the clipboard. The source code \`<pre>\` is hidden via CSS.

### 9.2 Search Highlight Sync

When the user searches, the JS runtime synchronizes search-match highlights onto the pre-rendered SVG nodes:

1. For each \`<mark data-search-match="true">\` inside a code block, compute its character offset within the \`<code>\` element.
2. Map the offset to a diagram node or table cell using the \`data-label-ord\` attribute.
3. Add \`.is-hit\` / \`.is-current\` classes to the matching SVG group.

### 9.3 Responsive Behavior

- On viewports ≤ 900px, the sidebar collapses to a hamburger menu.
- Diagram and table SVGs overflow horizontally with smooth scrolling.
- SVG \`viewBox\` ensures diagrams scale proportionally.

### 9.4 Theme Integration

SVG fills use CSS custom properties:

| Property | Usage |
|----------|-------|
| \`var(--accent)\` | Node borders, edge strokes, header text |
| \`var(--surface-2)\` | Node/cell backgrounds (dark mode) |
| \`var(--muted)\` | Subtitle text, grid lines |
| \`var(--text)\` | Cell body text |
| \`var(--border)\` | Grid strokes, container borders |

---

## 10. Processing Pipeline

\`\`\`
  input.mdd
      |
      v
  1. FRONTMATTER   Parse YAML frontmatter -> Options
      |
      v
  2. LEX           markdown-it tokenization
                    + wikilink inline rule
                    + diagram/table fence rules
                    + heading ID assignment (core rule)
      |
      v
  3. RESOLVE       Extract headings from tokens
                    Scan adjacent assets dir
                    Resolve each [[target]] -> #slug or file path
                    Detect collisions -> fail with error
      |
      v
  4. RENDER        markdown-it -> HTML body
                    diagram code blocks -> SVG
                    table code blocks -> SVG
                    [[target]] tokens -> <a> or <img> tags
      |
      v
  5. ASSEMBLE      Inject body into shell.html
                    Inline CSS/JS (--single) or link (--split)
                    Base64-encode images (--single)
                    Copy assets (--split)
      |
      v
  output/
\`\`\`

---

## 11. Output Modes

### 11.1 \`--split\`

\`\`\`
output/
  document.html      HTML with <link rel="stylesheet"> and <script src>
  style.css          All CSS
  app.js             All JS (TOC, search, theme, scroll-spy)
  assets/            Copied from input assets dir (if present)
\`\`\`

### 11.2 \`--single\`

\`\`\`
output/
  document.html      Everything inline: <style>, <script>, base64 images
\`\`\`

CSS injected as \`<style>\`, JS as \`<script>\`, images base64-encoded inline. Linked \`.mdd\`/\`.md\` files remain as \`href\` references (not inlined).

---

## 12. Callout Alerts (\`[!]\` & \`[!STRING]\`)

Blockquotes starting with \`[!]\` or \`[!<identifier>]\` render as unified callout boxes using the document's accent theme:

\`\`\`markdown
> [!]
> Highlighted callout without a header title

> [!NOTE]
> Information callout with a header title

> [!SYNTHESIS]
> Custom arbitrary callout header
\`\`\`

- **Bare Highlight \`[!]\`**: Renders the styled callout container without emitting a top title banner.
- **String-Agnostic \`[!STRING]\`**: Any identifier is accepted (\`[!NOTE]\`, \`[!TIP]\`, \`[!WARNING]\`, \`[!TAKEAWAY]\`, etc.) and rendered as the title.
- **Unified Accent Palette**: Color-agnostic design matching the document's \`--accent\` theme without hardcoded rainbow overrides.

---

## 13. Design Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Title fallback: \`title\` frontmatter -> \`.mdd\` filename | Simplest, no magic |
| D2 | Table alignment: always left | Simplest wins |
| D3 | Fence languages: \`diagram\` and \`table\` only | Our spec, no backward compat |
| D4 | Diamond nodes \`{text}\` in v1 | Trivial to add |
| D5 | Error format: stderr + exit 1 | No JSON output for now |
| D6 | Watch mode: dropped | Equivalent to \`npx http-server\` + manual rebuild |
| D7 | Runtime: Node.js + TypeScript | Rich ecosystem, existing test patterns |
| D8 | Parser: \`markdown-it\` | Most extensible JS Markdown parser |
| D9 | Single-file default: \`--split\` | Keeps output portable and debuggable |
| D10 | Image handling: base64 in \`--single\` | Self-contained output |
| D11 | Cross-doc links: \`href\` only, no recursive compile | Build-system concern |
| D12 | Only images + .mdd/.md for \`[[target]\` file refs | Scoped for v1 |

`;
