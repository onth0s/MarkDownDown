---
title: "Markdown++ DSL Specification"
accent: "#3b82f6"
theme: "dark"
---

# Markdown++ DSL Specification

> [!NOTE]
> **Status:** Ratified specification for the fenced code block languages in Markdown++: `diagram`, `table`, and `mirror`.

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
- **TITLE Directive**: Optional first-line metadata `TITLE: <text>`. Injected as `data-title` and SVG `aria-label`. When absent, the `aria-label` falls back to the nearest preceding heading in the document, then to the document title (§1.11).
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

A label may be wrapped in a matching pair of quotes — straight (`"`, `'`) or curly (`“ ”`, `‘ ’`). Quotes are quoting syntax, not content, and the matching outer pair is removed:

```diagram
TITLE: Quoted Labels
A["Straight quotes are stripped"]
B[“Curly quotes are stripped too”]
C["He said "hi" loudly"]
```

A quote is only a delimiter when the body both **starts and ends** with a matching partner, so a nested quoted phrase in C survives intact. Because the label may then contain any bracket or quote character, the body runs to the *last* closing bracket on the line.

### 1.5 Edge Types

```table
TITLE: Diagram Edge Types
| Syntax | Meaning |
| --> | Directed arrow (with arrowhead marker) |
| --- | Undirected line (no arrowhead) |
| -->\|label\| | Directed arrow with inline edge label |
| -- label --> | Directed arrow with inline label (label placed between the arrow stems) |
```

The arrowhead is a property of the **syntax**, not of the graph: only a form ending in `>` emits `marker-end`. `---` is undirected and is drawn without one.

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

### 1.8 Text Wrapping & Node Sizing

Long labels are word-wrapped to fit the node's inner width. Text is **not** measured by character count: the document font stack is proportional, so a single flat per-character rate over-measures lowercase prose by 15–54% and under-measures ALL-CAPS, wide glyphs (`M`, `W`) and the em-dash separator.

Instead, a per-glyph advance-width model is used. Each character contributes its own advance at the current font size, with separate tables for regular, bold, italic and monospace runs; inline `code` spans are charged at the monospace rate. Measured widths carry a 3% safety factor so accumulated sub-pixel error cannot push text past its box.

- A token too long to fit on any line is **hard-broken at character level**, so no line can ever exceed the wrap width.
- Node width is the widest wrapped line plus horizontal padding, rounded **up** to a whole pixel. Rounding down is never safe: a box narrower than the text inside it is the exact overflow this sizing exists to prevent.
- Node height is the text block's **ink** extent — cap height above the first baseline, descender depth below the last — plus vertical padding.
- The text block is centred on its **ink**, not on its baselines. A line's ink extends much further above its baseline (cap height) than below it (only the descenders of `g`, `y`, `p`), so a baseline-centred block reads as sitting low.
- Diamonds are **inscribed** around the lines they end up holding, not sized by a blanket multiplier. A rhombus with half-width `A` and half-height `B = A × aspect` has an available half-width of `A × (1 − |dy| / B)` at vertical offset `dy`; requiring that to fit the widest half-line plus an inset gives the closed form `A ≥ halfTextW + inset + |dy| / aspect`. A diamond whose text would still be too wide re-wraps narrower rather than growing without bound.

### 1.9 Layout Algorithm

```diagram
TITLE: Diagram Layout Engine Pipeline
PARSE["1. Parse AST — Extract nodes, labels, shapes & edges"]
RANK["2. Rank Assignment — Longest-path ranking from virtual root"]
ORDER["3. Crossing Reduction — Median heuristic within each rank"]
POS["4. Coordinate Geometry — Compute node bounding boxes"]
ROUTE["5. Edge Routing — Sample each route, repair overlaps, place labels"]
RENDER["6. SVG Emission — Render nodes, labels, paths & arrow markers"]

PARSE --> RANK
RANK --> ORDER
ORDER --> POS
POS --> ROUTE
ROUTE --> RENDER
```

### 1.10 Edge Routing

Every edge is routed as a sampled polyline, so collision work and the viewBox both reason about **real ink** rather than control points. A cubic's control points can sit far outside the curve it draws, and bounding-boxing them added ~85px of dead space at the bottom of a diagram.

**Forward edges.** Exit and entry ports are spread across the source and target faces when several edges share a node, so a fan-out does not stack on a single point. The route leaves along the flow axis with a control handle that bows sideways by a fixed amount, which keeps a straight edge straight and a diagonal edge smooth.

**Return arcs** (back-edges and self-loops) must not cut across the graph they are returning over:

| Orientation | Route | Why |
| TB | Out to a **side gutter** clear of every node, then back in | A dip below the graph would cross every intervening rank. |
| LR / RL | **Below** the graph | Exiting sideways would run straight through the intervening columns. |

The side is chosen per edge: whichever gutter is clear of the vertical band its source and target occupy. Self-loops return into the node's own edge as a tight side arc, and carry no cycle warning (§1.13).

**Arrowheads.** `marker-end` is emitted only for **directed** edges. `---` is undirected and is documented as having no arrowhead; it previously drew one anyway. The marker's `refX` sits at the tip, so the head lands *on* the node edge rather than stopping short of it and floating in the gap. Return arcs use a distinct hollow marker and a dashed stroke (`.is-back-edge`).

**Edge labels.** A label is placed at the first position along its route where its background clears every node, falling back to the route midpoint. In a left-to-right flow the inter-column gap is widened when the widest label needs more room than the default gap provides: a label wider than the gap it sits in has nowhere to slide to, and previously overlapped both of its own nodes.

**Repair, not failure.** After routing, any edge whose ink passes through a node it does not terminate on is re-threaded through a free corridor beside the obstruction and re-checked. Anything still unresolved is reported as a **non-fatal warning** (`edge A -> B passes through node "X" and could not be re-routed`) rather than failing the build. Endpoint contact with the edge's own source and target is expected, so the check ignores a short clearance at each end. Node-to-node overlap remains a hard error.

**viewBox.** The `viewBox` is the union of node boxes, sampled edge ink and label boxes, plus padding. A label wider than the drawing is a real defect, not something to crop.

### 1.11 SVG Output Elements & Classes

```table
TITLE: Diagram SVG Element Classes
| Class | Element | Purpose |
| diagram-svg | <svg> | Root diagram SVG; carries role=img, aria-label, viewBox, --svg-min-w |
| node | <g> | Groups one node's shape + text; carries data-label-ord for search |
| node-rect | <rect> | Node shape: rect, rx=3 (default) |
| node-rounded | modifier | On the rect when the node is a rounded rect (rx=18) |
| node-diamond | modifier | On the polygon when the node is a rhombus |
| node-title | <text> | Bold accent title text, one per wrapped title line |
| node-sub | <text> | Muted subtitle text, one per wrapped subtitle line |
| edge | <g> | Groups one edge's path + optional label; carries data-label-ord |
| edge-path | <path> | Edge connector |
| is-back-edge | modifier | On the path of a return arc (dashed stroke) |
| edge-label | <g> | Groups an edge label's background + text, translated to position |
| edge-label-bg | <rect> | Opaque label background (var(--surface-2)) |
| edge-label-text | <text> | Label text |
| is-hit | modifier | Matched during document search |
| is-current | modifier | Current active search selection |
```

Notes:

- `data-label-ord` maps a source-text offset back to an SVG element (§4.2). It is **omitted** on unlabelled elements rather than emitted as a `-1` sentinel, so a search match can never resolve to an arbitrary element.
- `style="--svg-min-w:<n>"` publishes a legibility floor for `templates/style.css`. `max-width:100%` alone lets a wide diagram shrink to any size the viewport demands, which on a phone turns an 11px edge label to mush; the floor scales the drawing down to 60% of its natural width and only then scrolls.
- Marker ids are derived from a hash of the model, title and orientation, so recompiling the same source is byte-identical.
- The `aria-label` is the `TITLE:` directive; failing that, the nearest preceding heading in the document; failing that, the document title.

### 1.12 Responsive Sizing

Diagram and table SVGs are emitted at their natural size and sized by CSS to fit the reading column, subject to the `--svg-min-w` floor above. Neither may exceed the reading column's usable width, which is why both renderers measure their text and wrap it: one long cell used to be enough to force a table ~1400px wide, permanently wider than the column it sits in.

### 1.13 Cyclic Diagrams

Cyclic (looping) edges are **supported**. A cycle — e.g. `A --> B` followed by `B --> A` — is normalized at layout time without failing compilation:

- Back-edges (edges closing a loop, detected via DFS colouring) are **skipped during rank assignment**, so the remaining graph is always a DAG and ranking is well defined.
- The cyclic edge is still **drawn** in the final SVG as a return arc (§1.10), so the loop remains visible.
- Compilation emits a **non-fatal warning** instead of an error: `Diagram contains N cyclic edge(s); normalized to a DAG for layout (drawn as return arcs).` The count is pluralised correctly, and a diagram whose only cycle is a self-loop does not warn at all — a self-loop is an ordinary construct and does not change the shape of the layout.
- **Self-loops** (`A --> A`) are detected as a back-edge, excluded from ranking, and drawn as a side arc that returns into the node's own edge.

Example:

```diagram
TITLE: Cyclic Flow Example
FEED["Feed — Ingestion"]
PROC["Process — Transformation"]
FEED --> PROC
PROC -->|feeds back| FEED
```

The above compiles to a top-to-bottom layout with a return arc from PROC back to FEED, routed out to the side gutter, and emits a "1 cyclic edge" warning.

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

Cell text is measured with the same font model as diagrams (§1.8) and wrapped inside a bounded column width. Row heights are derived from the number of wrapped lines in the tallest cell of the row, so a long cell wraps instead of stretching the table past the reading column (§1.12).

### 2.4 Layout & SVG Classes

```table
TITLE: Table SVG Element Classes
| Class | Element | Purpose |
| table-svg | <svg> | Root table SVG; carries role=img, aria-label, viewBox, --svg-min-w |
| tcell | <g> | Groups a cell's background + text; carries data-label-ord for search |
| tbl-head-bg | <rect> | Header cell accent-tinted surface |
| tbl-cell-bg | <rect> | Data cell surface |
| tbl-head-text | <text> | Header bold accent text, one per wrapped line |
| tbl-cell-text | <text> | Data cell body text, one per wrapped line |
| tbl-grid | <line> | Border grid strokes |
| is-hit | modifier | Highlighted during document search |
| is-current | modifier | Active search result match |
```

---

## 3. `mirror` Fence

### 3.1 Syntax & Subkinds

The `mirror` fence defines a document-native semantic audit layer. It accepts an optional subkind hint on the fence info string:

- ````mirror qa````: Structured question-and-answer pairs attached to a passage or section.
- ````mirror faq````: Frequently asked questions.
- ````mirror probe````: Structured semantic alignment probes with candidate options, author declared meaning, and divergence analysis.
- ````mirror clarification````: Targeted clarification notes on subtle distinctions.
- ````mirror````: Generic mirror block (automatically infers probe vs. Q&A based on content).

### 3.2 Metadata Directives

- `TITLE: <string>`: Optional title displayed in the card header and in-margin pill.
- `TARGET: <string>`: Optional anchor target attaching the mirror block to a specific section or heading.

### 3.3 Q&A Grammar

```
qa_block     := ( "Q:" question_text "\n" "A:" answer_text "\n"* )+
```

Each item consists of a `Q:` line followed by an `A:` line. Markdown formatting within question and answer text is rendered inline.

### 3.4 Alignment Probe Grammar

```
probe_block  := "PROBE:" claim_text "\n" option+ author_decl [divergence]
option       := ( "[ ]" | "[x]" ) option_text [ "-->" option_explanation ] "\n"
author_decl  := ( "AUTHOR:" | "MEANING:" | "DECLARED:" ) meaning_text "\n"
divergence   := ( "DIVERGENCE:" | "DIVERGE:" | "GAP:" ) divergence_text "\n"
```

- Exactly one option may be marked with `[x]` indicating alignment with the author's declared model.
- `AUTHOR:` establishes the author's declared conceptual map.
- `DIVERGENCE:` articulates why competing interpretations drift from the author's intended model.
- **Self-Audit**: The interactive runtime presents the reader with a two-way alignment choice:
  - `✓ I understand the author's distinction`
  - `⚡ I understand, but disagree with the premise`

---

## 4. Shared Rendering Rules

### 4.1 Copy Button

Each `diagram` and `table` block includes a `<button class="copy-btn">` that copies the raw DSL source to the clipboard. The source code `<pre>` is hidden via CSS (`.code-wrap.diagram pre, .code-wrap.table pre { display:none; }`).

### 4.2 Search Highlight Sync

Document search matches prose, fenced code blocks, inline code, and raw diagram/table DSL sources (the mirror DSL source is skipped — it is hidden and has no visual counterpart; the mirror card body itself is searchable). When the user searches, the runtime synchronizes search-match highlights onto pre-rendered SVG nodes and mirror cards:

1. For each `<mark data-search-match="true">` inside a code block, compute its character offset within the `<code>` element.
2. Map the offset to a diagram node or table cell using the `data-label-ord` attribute.
3. Add `.is-hit` / `.is-current` classes to the matching SVG group.
4. If a search result falls within a `.mirror-block` in Read Mode, the card automatically peeks open.

### 4.3 Responsive Behavior & Theme

- On viewports ≤ 900px, the sidebar collapses to a mobile drawer.
- Diagram and table SVGs are emitted at natural size and sized by CSS to fit the reading column (`max-width:100%`), down to a legibility floor of 60% of natural width published as `--svg-min-w` (§1.11). Below that floor the SVG scrolls horizontally with smooth 2px custom scrollbars, so a wide diagram is never shrunk into unreadability on a phone.
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

## 5. Reference Examples

### 5.1 Diagram Example

```diagram
TITLE: CLDS Artifact Relationship Flow
SPEC["SPECIFICATION LAYER — DIEGETICS.md / README / YAML schemas / behavioral contracts"]
AUDIT["AUDIT LAYER — INSPECTOR.md (procedure) → DISSONANCES.md (findings)"]
IMPL["IMPLEMENTATION CYCLE — REP-governed corrections; findings become ratified changes"]
SPEC -->|defines expected behavior| AUDIT
AUDIT -->|surfaces conformance gaps| IMPL
```

### 5.2 Pipe Table Example

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

### 5.3 Cyclic Diagram Example

```diagram
TITLE: Supervisor Loop
TASK["TASK QUEUE — pending work items"]
WORKER["WORKER POOL — processes items"]
TASK --> WORKER
WORKER -->|re-enqueues failures| TASK
WORKER --> DONE["COMPLETED"]
```

### 5.4 Mirror Alignment Probe Example

```mirror probe
TITLE: Semantic Alignment Probe
PROBE: What is the primary role of Mirror Mode?
[ ] A score-based quiz verifying reader memorization.
[x] A reader-side semantic audit exposing divergences between reader reconstruction and author meaning.
[ ] A static comment section for open-ended document discussions.

AUTHOR: Mirror Mode is explicitly an audit layer, not a quiz or evaluation metric. Understanding the author's distinction without necessarily agreeing with their premise is considered a successful mirror.
DIVERGENCE: Viewing the probe as a compliance test conflates semantic comprehension with ideological agreement.
```

### 5.5 Mirror Q&A Example

```mirror qa
TITLE: Frequently Asked Questions
Q: Can Mirror blocks be attached to any section in the document?
A: Yes, mirror blocks can be placed anywhere between paragraphs, sections, or diagrams.

Q: Does Read Mode show mirror cards by default?
A: No, Read Mode presents a clean publication view with discrete margin pills that can be peeked open on demand.
```
