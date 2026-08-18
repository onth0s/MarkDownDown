# Markdown++ DSL Specification

**Version:** 1.0
**Status:** Ratified against `scratch/CLDS_interactive_v15.html` (reference implementation)

This document specifies the two fenced code block languages in Markdown++: `diagram` and `table`.

---

## 1. `diagram` Fence

### 1.1 Syntax

````markdown
```diagram
TITLE: Diagram Title
flowchart LR
  NODE_A["Title — Subtitle"]
  NODE_B["Another node"]
  NODE_A -->|edge label| NODE_B
  NODE_B --- NODE_C
```
````

### 1.2 TITLE Directive

Optional first-line metadata. Format: `TITLE: <text>`.

- Used as `data-title` attribute on the wrapper `<div>`.
- Used as `aria-label` on the SVG for accessibility.
- If omitted, falls back to the `.mdd` filename.

### 1.3 Grammar

```
diagram      := [header] (node_def | edge_def | comment)*
header       := ("flowchart" | "graph") direction
direction    := "TB" | "TD" | "BT" | "RL" | "LR"
node_def     := NODE_ID ["[" label "]" | "(" label ")" | "{" label "}"]
edge_def     := node_ref arrow node_ref [ "|" label "|" ]
arrow        := "-->" | "---"
node_ref     := NODE_ID | node_def
NODE_ID      := [A-Za-z0-9_.\-]+
label        := [^\n]+ (trimmed)
comment      := "%%" [^\n]* (stripped, ignored)
```

### 1.4 Node Shapes

| Syntax | Shape | Use Case |
|--------|-------|----------|
| `[text]` | Rectangle (sharp corners) | Default. States, layers, artifacts. |
| `(text)` | Rounded rectangle (`rx=18`) | Processes, protocols, frameworks. |
| `{text}` | Diamond/rhombus | Decisions, conditions, branches. |

If no shape delimiter is provided, the node defaults to `[text]` (rectangle).

### 1.5 Edge Types

| Syntax | Meaning |
|--------|---------|
| `-->` | Directed arrow (with arrowhead marker) |
| `---` | Undirected line (no arrowhead) |
| `-->|label|` | Directed arrow with edge label |
| `-- label -->` | Alternative label syntax (not yet implemented) |

### 1.6 Directions

| Value | Flow Direction |
|-------|---------------|
| `TB` / `TD` | Top to bottom (default) |
| `LR` | Left to right |
| `RL` | Right to left |
| `BT` | Bottom to top (reversed rank order) |

### 1.7 Title–Subtitle Split

The ` — ` (em-dash, U+2014, with surrounding spaces) inside a node label splits the content into **title** (bold, accent color) and **subtitle** (lighter weight, muted color).

Example: `["SPECIFICATION LAYER — DIEGETICS.md / README"]` renders "SPECIFICATION LAYER" as the title and "DIEGETICS.md / README" as the subtitle.

If no em-dash is present, the entire text is rendered as the title.

### 1.8 Text Wrapping

Long labels are word-wrapped to fit within the node width. Text width is estimated using a constant `CHAR_WIDTH_PX` (7.4px per character at font-size 12px). Node width is determined by the longest line after wrapping, plus padding.

### 1.9 Layout Algorithm

1. **Parse** — Extract nodes and edges from the DSL.
2. **Rank** — Assign vertical (or horizontal) ranks based on edge direction. Uses longest-path ranking from a virtual root.
3. **Order** — Within each rank, minimize edge crossings using median ordering.
4. **Position** — Compute (x, y) coordinates with fixed vertical spacing (`RANK_SEP = 130px`) and node padding.
5. **Render** — Emit SVG with `<rect>`, `<text>`, `<line>`/`<path>`, and `<marker>` elements.

### 1.10 SVG Output

The rendered SVG uses these CSS classes for styling and interactivity:

| Class | Element | Purpose |
|-------|---------|---------|
| `diagram-svg` | `<svg>` | Root container |
| `node-group` | `<g>` | Groups a node's rect + text |
| `node-bg` | `<rect>` | Node background |
| `node-rect` | `<rect>` | Node background (interactive states) |
| `node-title` | `<text>` | Title text (bold, accent color) |
| `node-sub` | `<text>` | Subtitle text (muted) |
| `edge-line` | `<line>` | Edge connector |
| `edge-path` | `<path>` | Edge connector (curved) |
| `is-hit` | modifier | Matched during search |
| `is-current` | modifier | Current search match |

---

## 2. `table` Fence

### 2.1 Syntax

````markdown
```table
TITLE: Table Title
| Column A | Column B | Column C |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |
```
````

### 2.2 TITLE Directive

Same as `diagram` (§1.2). Optional first-line `TITLE: <text>`.

### 2.3 Grammar

```
table           := [title_directive] header_row separator data_rows*
title_directive := "TITLE:" text
header_row      := "|" cell ("|" cell)* ["|"]
separator       := "|"? ("-" | ":") ("-" | ":")+ ("|" ("-" | ":")+)* ["|"]
data_rows       := "|" cell ("|" cell)* ["|"]
cell            := [^\|]*
```

Standard GFM pipe-table syntax. Separator-row alignment markers (`:---`, `:---:`, `---:`) are parsed but ignored — all cells render left-aligned.

### 2.4 Layout

- Column widths are determined by the longest cell content in each column, plus padding.
- Row heights are fixed (30px for data rows, 34px for header rows).
- The header row gets a distinct background (accent-tinted surface).
- Cell padding: 12px horizontal, vertical centering.

### 2.5 SVG Output

| Class | Element | Purpose |
|-------|---------|---------|
| `table-svg` | `<svg>` | Root container |
| `tcell` | `<g>` | Groups a cell's rect + text |
| `tbl-head-bg` | `<rect>` | Header cell background |
| `tbl-cell-bg` | `<rect>` | Data cell background |
| `tbl-head-text` | `<text>` | Header cell text (bold, accent) |
| `tbl-cell-text` | `<text>` | Data cell text |
| `tbl-grid` | `<line>` | Cell border grid |
| `is-hit` | modifier | Matched during search |
| `is-current` | modifier | Current search match |

---

## 3. Shared Rendering Rules

### 3.1 Copy Button

Each `diagram` and `table` block gets a `<button class="copy-btn">` that copies the raw DSL source to the clipboard. The source code `<pre>` is hidden via CSS (`.code-wrap.diagram pre, .code-wrap.table pre { display:none; }`).

### 3.2 Search Highlight Sync

When the user searches, the JS runtime synchronizes search-match highlights onto the pre-rendered SVG nodes:

1. For each `<mark data-search-match="true">` inside a code block, compute its character offset within the `<code>` element.
2. Map the offset to a diagram node or table cell using the `data-label-ord` attribute.
3. Add `.is-hit` / `.is-current` classes to the matching SVG group.

This enables search to highlight individual nodes and cells within the SVG diagrams and tables.

### 3.3 Responsive Behavior

- On viewports ≤ 900px, the sidebar collapses to a hamburger menu.
- Diagram and table SVGs overflow horizontally with smooth scrolling.
- SVG `viewBox` ensures diagrams scale proportionally.

### 3.4 Theme Integration

SVG fills use CSS custom properties:

| Property | Usage |
|----------|-------|
| `var(--accent)` | Node borders, edge strokes, header text |
| `var(--surface-2)` | Node/cell backgrounds (dark mode) |
| `var(--muted)` | Subtitle text, grid lines |
| `var(--text)` | Cell body text |
| `var(--border)` | Grid strokes, container borders |

Light mode overrides use `#ffffff` as the base surface instead of `var(--surface-2)`.

---

## 4. Reference Examples

### 4.1 Flowchart (from CLDS)

```diagram
TITLE: CLDS Artifact Relationship Flow
flowchart LR
  SPEC["SPECIFICATION LAYER — DIEGETICS.md / README / YAML schemas / behavioral contracts"]
  AUDIT["AUDIT LAYER — INSPECTOR.md (procedure) → DISSONANCES.md (findings)"]
  IMPL["IMPLEMENTATION CYCLE — REP-governed corrections; findings become ratified changes"]
  SPEC -->|defines expected behavior| AUDIT
  AUDIT -->|surfaces conformance gaps| IMPL
```

### 4.2 Pipe Table (from CLDS)

```table
TITLE: Reading Cost Calibration
| Step | Reading Cost | Authority Exercised |
|------|-------------|---------------------|
| Minimal plan review | ~2 minutes | Architectural ratification |
| Annotation | ~5 minutes | Structural decisions |
| Full plan review | ~5 minutes | Drift check, not re-evaluation |
| Phase behavioral testing | Variable | Behavioral contract verification |
| Plan-implementation alignment audit | ~5 minutes | Coverage gap detection |
| Final iron-out review | ~2 minutes | Implementation hygiene |
```
