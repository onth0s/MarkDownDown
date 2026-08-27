---
title: "Markdown++ DSL Specification"
accent: "#3b82f6"
theme: "dark"
---

# Markdown++ DSL Specification

> [!NOTE]
> **Status:** Ratified specification for the two fenced code block languages in Markdown++: `diagram` and `table`.

---

## 1. `diagram` Fence

### 1.1 Syntax

````markdown
```diagram LR
TITLE: Diagram Title
NODE_A["Title — Subtitle"]
NODE_B["Another node"]
NODE_A -->|edge label| NODE_B
NODE_B --- NODE_C
```
````

### 1.2 Directives & Flow Direction

- **Fence Direction Argument**: Optional direction directly on the fence info string: ` ```diagram LR `, ` ```diagram TB `, ` ```diagram RL `, ` ```diagram BT `.
- **TITLE Directive**: Optional first-line metadata `TITLE: <text>`. Injected as `data-title` and SVG `aria-label`.
- **Direction In-Body**: Can also be specified inside the body as a bare token (e.g. `LR`) or directive `DIRECTION: LR`. If omitted, defaults to smart dynamic auto-layout.

### 1.3 Grammar

```
diagram      := "```diagram" [direction] [title_dir] [dir_spec] (node_def | edge_def | comment)* "```"
direction    := "TB" | "TD" | "BT" | "LR" | "RL" | "auto"
title_dir    := "TITLE:" text
dir_spec     := ("DIRECTION:"? direction) | (("flowchart"|"graph") direction?)
node_def     := NODE_ID ["[" label "]" | "(" label ")" | "{" label "}"]
edge_def     := node_ref arrow node_ref [ "|" label "|" ] | node_ref "--" label "-->" node_ref
arrow        := "-->" | "---"
node_ref     := NODE_ID | node_def
NODE_ID      := [A-Za-z0-9_.\-]+
label        := [^\n]+ (trimmed)
comment      := "%%" [^\n]* (stripped, ignored)
```

### 1.4 Node Shapes

```table
TITLE: Diagram Node Shapes
| Syntax | Shape | Use Case |
| [text] | Rectangle (sharp corners) | Default. States, layers, artifacts. |
| (text) | Rounded rectangle (rx=18) | Processes, protocols, frameworks. |
| {text} | Diamond / rhombus | Decisions, conditions, branches. |
```

If no shape delimiter is provided, the node defaults to `[text]` (rectangle).

### 1.5 Edge Types

```table
TITLE: Diagram Edge Types
| Syntax | Meaning |
| --> | Directed arrow (with arrowhead marker) |
| --- | Undirected line (no arrowhead) |
| -->\|label\| | Directed arrow with inline edge label |
| -- label --> | Directed arrow with inline label (label placed between the arrow stems) |
```

### 1.6 Directions

```table
TITLE: Diagram Flow Directions
| Value | Flow Direction |
| TB / TD | Top to bottom (default) |
| LR | Left to right |
| RL | Right to left |
| BT | Bottom to top (reversed rank order) |
| auto | Responsive dynamic layout (TB on mobile, LR on desktop) |
```

### 1.7 Title–Subtitle Split

The ` — ` (em-dash, U+2014, with surrounding spaces) inside a node label splits the content into **title** (bold, accent color) and **subtitle** (lighter weight, muted color).

Example: `["SPECIFICATION LAYER — DIEGETICS.md / README"]` renders "SPECIFICATION LAYER" as the title and "DIEGETICS.md / README" as the subtitle.

If no em-dash is present, the entire text is rendered as the title.

To render a literal em-dash in the title without splitting, escape it with a leading backslash: `["Cost \— Benefit analysis"]` renders a single title "Cost — Benefit analysis" with no subtitle (the backslash is stripped and is not rendered).

### 1.8 Text Wrapping

Long labels are word-wrapped to fit within the node width. Text width is estimated using a constant `CHAR_WIDTH_PX` (7.4px per character at font-size 12px). Node width is determined by the longest line after wrapping, plus padding.

### 1.9 Layout Algorithm

```diagram
TITLE: Diagram Layout Engine Pipeline
PARSE["1. Parse AST — Extract nodes, labels, shapes & edges"]
RANK["2. Rank Assignment — Longest-path ranking from virtual root"]
ORDER["3. Crossing Reduction — Median heuristic within each rank"]
POS["4. Coordinate Geometry — Compute bounding boxes & edge paths"]
RENDER["5. SVG Emission — Render nodes, labels, paths & arrow markers"]

PARSE --> RANK
RANK --> ORDER
ORDER --> POS
POS --> RENDER
```

### 1.10 SVG Output Elements & Classes

```table
TITLE: Diagram SVG Element Classes
| Class | Element | Purpose |
| diagram-svg | <svg> | Root diagram SVG container |
| node-group | <g> | Groups a node's rect + text |
| node-bg | <rect> | Base node background fill |
| node-rect | <rect> | Interactive node rectangle |
| node-title | <text> | Bold accent title text |
| node-sub | <text> | Muted subtitle text |
| edge-line | <line> | Straight edge connector |
| edge-path | <path> | Curved edge connector |
| is-hit | modifier | Matched during document search |
| is-current | modifier | Current active search selection |
```

### 1.11 Cyclic Diagrams

Cyclic (looping) edges are **supported**. A cycle — e.g. `A --> B` followed by `B --> A` — is normalized at layout time without failing compilation:

- Back-edges (edges closing a loop, detected via DFS colouring) are **skipped during rank assignment**, so the remaining graph is always a DAG and ranking is well defined.
- The cyclic edge is still **drawn** in the final SVG as a return arc, so the loop remains visible.
- Compilation emits a **non-fatal warning** instead of an error: `Diagram contains N cyclic edge(s); normalized to a DAG for layout (drawn as return arcs).`
- **Self-loops** (`A --> A`) are handled the same way — detected as a back-edge, excluded from ranking, rendered as an arc.

Example:

```diagram
TITLE: Cyclic Flow Example
FEED["Feed — Ingestion"]
PROC["Process — Transformation"]
FEED --> PROC
PROC -->|feeds back| FEED
```

The above compiles to a top-to-bottom layout with a return arc from PROC back to FEED and emits a "1 cyclic edge(s)" warning.

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

Optional first-line `TITLE: <text>` metadata rendered into the code wrap header bar and SVG accessibility label.

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

### 2.4 Layout & SVG Classes

```table
TITLE: Table SVG Element Classes
| Class | Element | Purpose |
| table-svg | <svg> | Root table SVG container |
| tcell | <g> | Groups a cell's rect + text |
| tbl-head-bg | <rect> | Header cell accent-tinted surface |
| tbl-cell-bg | <rect> | Data cell surface |
| tbl-head-text | <text> | Header bold accent text |
| tbl-cell-text | <text> | Data cell body text |
| tbl-grid | <line> | Border grid strokes |
| is-hit | modifier | Highlighted during document search |
| is-current | modifier | Active search result match |
```

---

## 3. Shared Rendering Rules

### 3.1 Copy Button

Each `diagram` and `table` block includes a `<button class="copy-btn">` that copies the raw DSL source to the clipboard. The source code `<pre>` is hidden via CSS (`.code-wrap.diagram pre, .code-wrap.table pre { display:none; }`).

### 3.2 Search Highlight Sync

When the user searches, the runtime synchronizes search-match highlights onto the pre-rendered SVG nodes:

1. For each `<mark data-search-match="true">` inside a code block, compute its character offset within the `<code>` element.
2. Map the offset to a diagram node or table cell using the `data-label-ord` attribute.
3. Add `.is-hit` / `.is-current` classes to the matching SVG group.

### 3.3 Responsive Behavior & Theme

- On viewports ≤ 900px, the sidebar collapses to a mobile drawer.
- Diagram and table SVGs overflow horizontally with smooth 2px custom scrollbars.
- SVG fills automatically inherit dynamic CSS custom properties:

```table
TITLE: Theme Integration CSS Variables
| Property | Usage |
| var(--accent) | Node borders, edge strokes, header text |
| var(--surface-2) | Node / cell backgrounds in dark mode |
| var(--muted) | Subtitle text, grid lines |
| var(--text) | Cell body text |
| var(--border) | Grid strokes, container borders |
```

---

## 4. Reference Examples

### 4.1 Diagram Example

```diagram
TITLE: CLDS Artifact Relationship Flow
SPEC["SPECIFICATION LAYER — DIEGETICS.md / README / YAML schemas / behavioral contracts"]
AUDIT["AUDIT LAYER — INSPECTOR.md (procedure) → DISSONANCES.md (findings)"]
IMPL["IMPLEMENTATION CYCLE — REP-governed corrections; findings become ratified changes"]
SPEC -->|defines expected behavior| AUDIT
AUDIT -->|surfaces conformance gaps| IMPL
```

### 4.2 Pipe Table Example

```table
TITLE: Reading Cost Calibration
| Step | Reading Cost | Authority Exercised |
| Minimal plan review | ~2 minutes | Architectural ratification |
| Annotation | ~5 minutes | Structural decisions |
| Full plan review | ~5 minutes | Drift check, not re-evaluation |
| Phase behavioral testing | Variable | Behavioral contract verification |
| Plan-implementation alignment audit | ~5 minutes | Coverage gap detection |
| Final iron-out review | ~2 minutes | Implementation hygiene |
```

### 4.3 Cyclic Diagram Example

```diagram
TITLE: Supervisor Loop
TASK["TASK QUEUE — pending work items"]
WORKER["WORKER POOL — processes items"]
TASK --> WORKER
WORKER -->|re-enqueues failures| TASK
WORKER --> DONE["COMPLETED"]
```
