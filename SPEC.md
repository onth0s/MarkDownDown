# Markdown++ Language Specification

**Version:** 1.0
**Status:** Ratified against `scratch/CLDS_interactive_v15.html` (reference implementation)

---

## 1. Overview

Markdown++ (`.mdd`) is standard GitHub-Flavored Markdown extended with:

- Two inline constructs: **wikilinks** and **escaped wikilinks**
- Two fenced code block languages: **`diagram`** and **`table`**
- **Item / Glossary Headings** — `# * Term`, `## * Term`, `### * Term`, `#### * Term` bulleted hierarchy with automatic bullet-stripping and anchor generation
- Optional **YAML frontmatter** for document metadata

Everything else is GFM. The file extension is `.mdd`.

---

## 2. YAML Frontmatter (optional)

Delimited by `---` fences at the start of the document.

```yaml
---
title: "Document Title"
author: "Author Name"
assets_dir: "./assets"
accent: "#3b82f6"
custom_css: "./extras.css"
custom_js: "./extras.js"
---
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `title` | string | `.mdd` filename (stem) | Document title. Injected into `<title>`, topbar brand, and hero if present. |
| `author` | string | (none) | Author name. Not rendered in v1. |
| `assets_dir` | string | `./assets/` relative to `.mdd` | Directory to scan for wikilink file resolution. |
| `accent` | string | `#3b82f6` | Hex accent color. Drives CSS custom properties and SVG fills. |
| `bg_lum` | string / array / object | `[0.08 : 0.96]` | Background luminosity overrides for dark and light modes (`0.0` to `1.0`). |
| `logo` | string | (none) | Path to custom brand logo SVG or image. Used for navbar and dynamic favicon. |
| `custom_css` | string | (none) | Path to extra CSS file. Inlined in output. |
| `custom_js` | string | (none) | Path to extra JS file. Inlined in output. |

### 2.1 Background Luminosity (`bg_lum`)

Accepts both slice syntax and key-value mappings:

- **Slice / Array syntax (Option A)**:
  - `bg_lum: "0.0 : 0.9"` — dark mode pitch black (`0.0`), light mode `0.9`
  - `bg_lum: "[:0.85]"` or `bg_lum: ": 0.85"` — dark default, light `0.85`
  - `bg_lum: "[0.0:]"` or `bg_lum: "0.0 :"` — dark `0.0`, light default
  - `bg_lum: [0.0, 0.9]` or `bg_lum: [null, 0.9]`
- **Mapping syntax (Option B)**:
  ```yaml
  bg_lum:
    dark: 0.05
    light: 0.95
  ```

All keys are optional. Unknown keys are ignored. Frontmatter values override CLI defaults.

---

## 3. Inline Extension: Wikilinks `[[str]]`

### 3.1 Syntax

| Form | Meaning |
|------|---------|
| `[[str]]` | Self-referencing link. Display text = `str`. |
| `[[str\|display]]` | Aliased link. Resolves `str`, displays `display`. |
| `\[[str]]` | Escaped. Renders as literal `[[str]]`. |

Inside fenced code blocks and inline code, `[[str]]` is always literal (markdown-it handles this natively).

### 3.2 Resolution Order (first match wins)

**0. Extension fast-path** — If `str` contains a `.` (i.e. it looks like a filename with an extension), heading resolution is **skipped entirely** and the resolver jumps directly to step 2 (file match). This is unambiguous: `[[logo.png]]` always means the file, never a heading named `"logo.png"`.

**1. Heading match** — (only when `str` has no extension) `str` is run through the 4-pass fuzzy heading resolver (§4). If a unique match is found → `<a href="#slug">display</a>`.

> **Heading-first is intentional.** When `str` has no extension, headings take priority over same-named files. A user with a heading `"Logo"` and an asset `logo.png` who writes `[[logo]]` gets the heading. To link the image they must write `[[logo.png]]`. This is unambiguous and expected.

**2. File match** — `str` is checked against the adjacent assets directory:
- No extension → probe `.png`, `.jpg`, `.jpeg`, `.svg`, `.gif`, `.webp`, `.mp4`, `.webm`, `.mdd`, `.md` in that order.
- Has extension → exact basename match.
- Subdirectory paths allowed: `[[subdir/image.png]]`.
- Matched `.mdd` or `.md` → `<a href="path/to/file.mdd">display</a>`.
- Matched image/video → `<img>` tag (base64 inlined in `--single`, relative `src` in `--split`).

**3. Collision** — >1 match at any step → compiler error, stderr, exit 1. No silent guessing. Cross-step collisions are **not** raised; the priority order is definitive.

**4. Not found** — Neither heading nor file matches → compiler error.

---

## 4. Fuzzy Heading Resolver

Given `str` from `[[str]]`, resolve against all `h1`–`h6` headings in the document. Each heading has `{text, id}` where `id` is markdown-it's slug (lowercase, hyphens, non-alphanumeric stripped — same as GFM anchors).

### Pass 1 — Exact
Case-sensitive, whitespace-exact: `str === heading.text`.

### Pass 2 — Normalized
```
norm(s) = s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim()
```
Compare `norm(str) === norm(heading.text)`.

### Pass 3 — Substring
- 3a. `norm(str)` starts with `norm(heading.text)` or vice versa (prefix).
- 3b. `norm(str)` contains `norm(heading.text)` or vice versa (substring).
- Union all matches. If >1 → collision.

### Pass 4 — Levenshtein
Compute edit distance between `norm(str)` and each `norm(heading.text)`. Accept the closest match if `distance <= max(2, floor(len(norm(heading.text)) * 0.3))`. Ties at same minimum distance → collision.

### Ambiguity Error Format
```
ERROR: [[str]] is ambiguous — matched N headings:
  1. "Heading One" (pass: exact-normalized)
  2. "Heading Two" (pass: Levenshtein d=1)
Resolve to a unique string or use the full heading text.
```

---

## 5. Escaping

- `\[[str]]` → literal `[[str]]`
- Inside `` `inline code` `` → literal
- Inside fenced code blocks → literal
- Standard GFM backslash escapes apply for all other Markdown syntax

---

## 6. Heading ID Generation & Item Headings

All headings (`h1`–`h6`) receive an `id` attribute for anchor linking and wikilink resolution. The slug is generated by:

```
slugify(text) = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
```

This matches GFM anchor behavior. Example: `## Part I: The Two Regimes` → `id="part-i-the-two-regimes"`.

### 6.1 Item / Glossary Headings

Headings starting with a bullet marker (`*`, `-`, or `•`) are treated as **Item / Glossary Headings**:

```markdown
### Doctrine & State Theory

#### * Romanism
The doctrine of state-directed, militarized internal colonization.

#### * Liquidation
Systematic dissolution of national sovereignty and civilizational capacity.
```

- **ID Generation**: The leading bullet marker is automatically stripped from the slug (`#### * Romanism` generates `id="romanism"`). Wikilinks resolve directly as `[[Romanism]]` or `[[romanism]]`.
- **TOC & Main Content Styling**: Renders with an accent bullet dot (`•`) in both the sidebar TOC and the document body. The heading text is cleanly aligned and coupled tightly with its following definition paragraph.

---

## 7. CLI Interface

```
markdown++ <input.mdd> [options]

Options:
  -o, --output <path>       Output file (--single) or directory (--split)
  --single                  Single self-contained HTML (all inlined)
  --split                   Separate CSS/JS/assets (default)
  --assets-dir <path>       Assets directory (default: ./assets/ relative to input)
  --no-diagrams             Skip diagram SVG rendering
  --no-tables               Skip table SVG rendering
  -v, --verbose             Verbose output
  -h, --help                Show help
```

Exit codes:
- `0` — Success
- `1` — Compilation error (parse failure, unresolved reference, collision)

---

## 8. Output Modes

### 8.1 `--split` (default)

```
output/
├── document.html      # HTML with <link rel="stylesheet"> and <script src>
├── style.css          # All CSS
├── app.js             # All JS (TOC, search, theme, scroll-spy)
└── assets/            # Copied from input assets dir (if present)
```

### 8.2 `--single`

```
output/
└── document.html      # Everything inline: <style>, <script>, base64 images
```

CSS injected as `<style>`, JS as `<script>`, images base64-encoded inline. Linked `.mdd`/`.md` files remain as `href` references (not inlined).

---

## 9. Processing Pipeline

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
  │              │  + heading ID assignment (core rule)
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

## 10. Callout Alerts (`[!]` & `[!STRING]`)

Blockquotes starting with `[!]` or `[!<tag>]` are rendered as accent-styled callout boxes:

```markdown
> [!]
> Highlighted callout without a header title

> [!NOTE]
> Information callout with a header title

> [!SYNTHESIS]
> Custom arbitrary callout title
```

- **Bare Highlight `[!]`**: Renders the styled callout container without emitting a top title banner.
- **String-Agnostic `[!STRING]`**: Accepts any identifier (`[!NOTE]`, `[!WARNING]`, `[!KEY TAKEAWAY]`, etc.), capitalized into the title header.
- **Color & Accent Unified**: Rendered with the document's accent color theme (`class="alert"`).

---

## 11. In-Page Navigation History Stack

Markdown++ documents feature an in-page navigation manager for internal wikilink traversal:

- **Bidirectional History Stack**: Preserves exact scroll position and origin wikilink tokens on forward and backward navigation (`Alt+Left` / `Alt+Right` / `Escape`).
- **Floating Pill UI**: Fixed outside the sidebar to the right in the content column, displaying previous/next destination labels, a clear button (`×`), and bidirectional navigation controls.
- **Search Query Preservation**: Restores previous search query state and exact scroll coordinates when navigating back from a jump performed during an active search.
- **High-Contrast Arrival Pulse**: Pulses destination headings on forward jumps and origin wikilinks on history undo with text luminosity inversion.

---

## 12. Design Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Title fallback: `title` frontmatter → `.mdd` filename | Simplest, no magic |
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
