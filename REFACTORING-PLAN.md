# Markdown++ — Refactoring Implementation Plan

> Generated from full codebase audit. Execute phases sequentially.
> Each phase ends with `npm run lint && npm run typecheck && npm test` to verify.

---

## Audit Summary

| Category | Critical | Moderate | Low |
|---|---|---|---|
| Duplicated code | 3 patterns | 3 patterns | — |
| Architecture | 2 (sync I/O, mutation) | 2 (CWD coupling, no I/O abstraction) | 1 |
| Type safety | — | 3 (non-null assertions, `as Error` casts) | 2 |
| Error handling | 3 (swallowed errors, no loop guard) | 2 (async-but-sync, no cpSync guard) | 1 |
| Naming / dead code | 1 (dead `fence.ts`) | 4 (cryptic names, unhandled union) | 2 |
| Security | 1 (innerHTML data-attr) | 3 (regex injection, path copy, HTML decode) | 1 |
| Performance | 2 (sync I/O blocking) | 3 (regex recompilation, O(n²) dedup) | 1 |
| Config / deps | 1 (types/jest mismatch) | 1 (skipped tests in recompile) | 3 |

---

## Phase 0 — Housekeeping (deps, config, dead code)

**Goal:** Clean foundation before refactoring. Zero behavior change.

### 0.1 Fix `@types/jest` version mismatch
- `package.json:23` — Change `"@types/jest": "^30.0.0"` → `"^29.5.0"`
- Run `npm install`

### 0.2 Stop skipping critical tests in `recompile.ps1`
- `recompile.ps1:18` — Remove `--testPathIgnorePatterns='template|frontmatter|end-to-end'`
- Run the full suite manually once to confirm these 3 suites pass

### 0.3 Mark dead code for Phase 1
- `util/fence.ts` exports `parseTitleDirective` — **never imported anywhere**
- The TITLE-parsing logic is duplicated inline in both `parser/diagram.ts:31-33` and `parser/table.ts:28-30`
- **Do NOT delete yet** — Phase 1 will create a shared fence wrapper that imports from it, eliminating the duplication

### 0.4 Clean dead config in `tsconfig.json`
- `tsconfig.json:13-15` — Remove `declaration`, `declarationMap`, `sourceMap` (useless with `--noEmit`)
- Add `"forceConsistentCasingInFileNames": true` explicitly

### 0.5 Fix no-op expression
- `renderer/diagram-svg.ts:151` — `const fromRaw = m[1], toRaw = m[3] ?? m[3]` — the `?? m[3]` is a no-op. Change to `toRaw = m[3]`

### 0.6 Improve `.gitignore`
- Add: `coverage/`, `*.tsbuildinfo`, `.DS_Store`, `Thumbs.db`

### 0.7 Extract esbuild config from inline script
- Create `build.mjs` with the esbuild config as a proper module
- `package.json:11` — Change build script to `"node build.mjs"`

**Verification:** `npm run build && npm run lint && npm run typecheck && npm test`

---

## Phase 1 — Extract shared TITLE parser and fence helper

**Goal:** Eliminate the triplicated TITLE-parsing and fence-wrapping logic.

### 1.1 Create `src/parser/fence-wrapper.ts`
Extract a shared helper that both `diagram.ts` and `table.ts` call:

```ts
// src/parser/fence-wrapper.ts
import { parseTitleDirective } from '../util/fence.js';  // reuse the deleted file → restore it
import { escHtml } from '../util/escape.js';

export interface FenceBlock {
  kind: string;           // 'diagram' | 'table'
  renderDivClass: string; // 'diagram-render' | 'table-render'
}

export function createFenceRenderer(
  md: MarkdownIt,
  block: FenceBlock,
): void {
  const defaultFence = md.renderer.rules.fence!.bind(md.renderer);
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    if (token.info.trim() !== block.kind) {
      return defaultFence(tokens, idx, options, env, self);
    }
    const { title, body } = parseTitleDirective(token.content);
    const safeTitle = title.replace(/"/g, '&quot;');
    const safeContent = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return (
      `<div class="code-wrap ${block.kind}" data-title="${safeTitle}">` +
      `<pre><code class="language-${block.kind}">${safeContent}</code></pre>` +
      `<div class="${block.renderDivClass}"></div>` +
      `</div>\n`
    );
  };
}
```

### 1.2 Rewrite `parser/diagram.ts` and `parser/table.ts`
- Each becomes a 3-line file that calls `createFenceRenderer(md, { kind: 'diagram', renderDivClass: 'diagram-render' })`

**Verification:** `npm run lint && npm run typecheck && npm test`

---

## Phase 2 — Extract shared utilities (template loader, hex-to-RGB, regex constants)

**Goal:** Remove the 3x duplicated template-loader pattern and the duplicated hex-to-RGB logic.

### 2.1 Create `src/util/template-loader.ts`
A single function that `css.ts`, `js.ts`, and `template.ts` all call:

```ts
export function loadTemplate(filename: string): string { ... }
```

- Remove `cachedCss` / `cachedJs` module-level caches (they serve no purpose in a CLI that runs once)
- Remove the 3-way CWD candidate probing from `css.ts`, `js.ts`, `template.ts` — replace with a single `loadTemplate(name)` call

### 2.2 Create `src/util/color.ts`
Extract `hexToRgb` and `darkenHex`:

```ts
export function hexToRgb(hex: string): string { ... }
export function darkenHex(hex: string): string { ... }
```

- `pipeline/assemble.ts:49-50` — Replace inline hex-to-RGB with `hexToRgb(accent)`
- `renderer/template.ts:13-19` — Replace inline `darkenHex` with imported version

### 2.3 Pre-compile regex constants in `pipeline/render-body.ts`
- Lines 79-80, 116-117, 143-153 — Move the 5 complex regex patterns to module-level `const` declarations
- This avoids re-compilation on every `renderBody()` call

**Verification:** `npm run lint && npm run typecheck && npm test`

---

## Phase 3 — Fix the async-but-sync `compile` function

**Goal:** Make the function signature match reality. Either go truly async or truly sync.

### Decision: Make `compile` synchronous
The entire pipeline is synchronous (`readFileSync`, `readdirSync`, `writeFileSync`). Making it async would require rewriting every FS call and every call site. Since this is a CLI tool (not a server), synchronous is fine.

### 3.1 Change `compile.ts:17`
- `export async function compile(options: Options): Promise<CompileResult>` → `export function compile(options: Options): CompileResult`

### 3.2 Change `cli.ts:67`
- `const result = await compile(options)` → `const result = compile(options)`
- Remove `async` from the `.action()` callback (line 25)
- Change `program.parseAsync(process.argv)` → `program.parse(process.argv)`

**Verification:** `npm run lint && npm run typecheck && npm test`

---

## Phase 4 — Type safety hardening

**Goal:** Eliminate unsafe `!` assertions and `as Error` casts.

### 4.1 Replace `as Error` casts with a helper
Create `src/util/error.ts`:

```ts
export function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return String(err);
}
```

Replace all 5 `as Error` cast sites:
- `cli.ts:73`
- `resolver/wikilink.ts:52`
- `pipeline/render-body.ts:107, 135`
- `pipeline/resolve-links.ts:40`

### 4.2 Reduce non-null assertions in `diagram-svg.ts`
- Lines 119, 125, 224, 239, etc. — Many `map.get(id)!` calls follow a `.has()` check. Replace with a `getOrThrow(map, id, context)` helper that throws a clear error if missing
- Lines 320-323, 371, 378, 383 — Same pattern in `diagramBuildSvg` and `buildLrSvg`

### 4.3 Type `direction` properly
- `diagram-svg.ts:69` — `direction: string` → `direction: 'TB' | 'TD' | 'BT' | 'LR' | 'RL' | 'auto'`
- This propagates to `diagramParse` return type and downstream consumers

### 4.4 Rename `forceLR` to a clearer name
- `diagram-svg.ts:304` — `forceLR?: boolean` → `forceHorizontal?: boolean`

**Verification:** `npm run lint && npm run typecheck && npm test`

---

## Phase 5 — Error handling improvements

**Goal:** Stop swallowing errors silently. Surface useful diagnostics.

### 5.1 Fix frontmatter error swallowing
- `parser/frontmatter.ts:39` — The YAML parse error message is discarded. Extract it:
  ```ts
  catch (err) {
    warnings.push(`Invalid YAML frontmatter: ${toErrorMessage(err)}`);
    // continue with defaults
  }
  ```

### 5.2 Fix template-load error swallowing
- `renderer/template.ts:51`, `renderer/css.ts:26`, `renderer/js.ts:32` — The `catch { /* continue */ }` hides corrupted file reads. After Phase 2's `loadTemplate()`, this is a single site. Log the path that failed:
  ```ts
  catch (err) {
    // try next candidate — but if all fail, the thrown error below names them
  }
  ```

### 5.3 Guard `fs.cpSync` in `pipeline/assemble.ts:97`
- Wrap in try/catch, push warning on failure instead of crashing the entire compilation

### 5.4 Guard recursive directory walk in `resolver/asset.ts:22-43`
- Add a max-depth guard (e.g., 10 levels) to prevent infinite loops from symlink cycles
- Wrap `readdirSync` in try/catch per-entry to skip unreadable files gracefully

### 5.5 Handle the unhandled `'not-found'` union variant
- `resolver/wikilink.ts:36-43` — The `if/else if` chain doesn't handle `headingResult.type === 'not-found'`. Add explicit handling (it already falls through to asset resolution, which is correct — but make it explicit with a comment or a case)

**Verification:** `npm run lint && npm run typecheck && npm test`

---

## Phase 6 — Refactor `diagram-svg.ts` (the largest file, 516 lines)

**Goal:** Decompose the two 100-line SVG builder functions into manageable pieces.

### 6.1 Extract `diagramBuildSvg` into `buildTbSvg` + `buildLrSvg`
- `diagramBuildSvg` (lines 304-407) is the TB direction builder. Rename to `buildTbSvg`
- `buildLrSvg` (lines 409-504) is already separate
- `diagramBuildSvg` becomes a thin dispatcher: `if (isLR) return buildLrSvg(...); else return buildTbSvg(...)`

### 6.2 Extract SVG primitives
- Create `src/renderer/svg-helpers.ts`:
  - `R()`, `P()`, `AT()` — rename to `round1()`, `coordPair()`, `xyAttrs()`
  - `textWidth()` — move here
  - `wrapText()` — move here
  - `buildArrowMarker(id)` — extract the repeated `<marker>` SVG string

### 6.3 Extract edge-rendering into helper functions
- `buildTbEdge(edge, model, arrowId)` → returns SVG `<g>` string
- `buildLrEdge(edge, nodeById, sc, arrowId)` → returns SVG `<g>` string

### 6.4 Extract node-rendering into helper functions
- `buildTbNode(node, model)` → returns SVG `<g>` string
- `buildLrNode(nd, sc)` → returns SVG `<g>` string

### 6.5 Rename cryptic exports
- `R` → `round1`, `P` → `coordPair`, `AT` → `xyAttrs`
- These are internal only so no API break

### 6.6 Fix module-level mutable state
- `arrowCounter` (line 13) — Reset at the start of each `diagramBuildSvg` call, or pass a counter through the model. Since diagrams are parsed/rendered sequentially in the pipeline, a per-call counter is cleaner:
  ```ts
  let arrowId = 0;
  // inside diagramBuildSvg:
  const id = `arrow-${arrowId++}`;
  ```

**Verification:** `npm run lint && npm run typecheck && npm test`

---

## Phase 7 — Refactor `pipeline/render-body.ts` (SVG injection and copy-button logic)

**Goal:** Extract the 3 distinct concerns into focused functions.

### 7.1 Extract `injectDiagramSvgs(html, docTitle, warnings): string`
- Lines 78-111 — Move to `src/pipeline/inject-diagrams.ts`
- Pre-compiled regex at module level

### 7.2 Extract `injectTableSvgs(html, docTitle, warnings): string`
- Lines 114-139 — Move to `src/pipeline/inject-tables.ts`
- Pre-compiled regex at module level

### 7.3 Extract `wrapCodeBlocksWithCopyButtons(html): string`
- Lines 142-154 — Move to a utility in `src/pipeline/copy-buttons.ts`
- The 3 chained regex replacements form a mini-protocol: add a comment explaining the protocol

### 7.4 Refactor `renderBody` to compose these
```ts
export function renderBody(...): string {
  // build linkMap, assign wikilink renderer
  let html = md.render(markdownBody);
  if (!options.noDiagrams) html = injectDiagramSvgs(html, docTitle, warnings);
  if (!options.noTables) html = injectTableSvgs(html, docTitle, warnings);
  html = wrapCodeBlocksWithCopyButtons(html);
  return html;
}
```

**Verification:** `npm run lint && npm run typecheck && npm test`

---

## Phase 8 — Security hardening

**Goal:** Close identified XSS and path-traversal vectors.

### 8.1 Re-escape SVG-injected content
- `pipeline/inject-diagrams.ts` and `inject-tables.ts` — After `htmlDecode(codeContent)`, the decoded content is placed into `<pre><code>`. Re-escape it with `escHtml()` before insertion to prevent any encoded HTML from leaking through

### 8.2 Sanitize `innerHTML` in data-attribute
- `templates/app.js:354` — `node.dataset.originalHtml = node.innerHTML` stores raw HTML in a `data-*` attribute. Encode it:
  ```js
  node.dataset.originalHtml = encodeURIComponent(node.innerHTML);
  // retrieval:
  const original = decodeURIComponent(node.dataset.originalHtml);
  ```

### 8.3 Filter `fs.cpSync` in split mode
- `pipeline/assemble.ts:97` — Don't blindly copy the entire assets directory. Skip dotfiles, symlinks, and files above a reasonable size threshold (e.g., 50MB)

### 8.4 Validate accent color format
- `cli.ts:57`, `renderer/template.ts:82` — The accent color is injected into CSS and SVG without validation. Add a `isValidHex(color: string): boolean` guard in `src/util/color.ts` and reject invalid values early in `cli.ts`

**Verification:** `npm run lint && npm run typecheck && npm test`

---

## Phase 9 — Performance optimizations

**Goal:** Reduce unnecessary work in the pipeline.

### 9.1 Use Levenshtein space-optimized single-row variant
- `resolver/heading.ts:32-45` — Replace the O(m×n) full DP table with a single-row version:
  ```ts
  function levenshtein(a: string, b: string): number {
    const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    const curr = new Array(b.length + 1);
    for (let i = 1; i <= a.length; i++) {
      curr[0] = i;
      for (let j = 1; j <= b.length; j++) {
        curr[j] = a[i-1] === b[j-1] ? prev[j-1] : 1 + Math.min(prev[j], curr[j-1], prev[j-1]);
      }
      [prev, curr] = [curr, prev];
    }
    return prev[b.length];
  }
  ```

### 9.2 Use Set for substring deduplication
- `resolver/heading.ts:83-85` — Replace `findIndex` inside `filter` (O(n²)) with a `Set`:
  ```ts
  const seen = new Set<string>();
  const uniqueSub = substringMatches.filter(v => {
    if (seen.has(v.heading.id)) return false;
    seen.add(v.heading.id);
    return true;
  });
  ```

### 9.3 Eliminate module-level mutable caches
- `renderer/css.ts:11` (`cachedCss`) and `renderer/js.ts:17` (`cachedJs`) — These persist for the process lifetime. After Phase 2's `loadTemplate()`, they're gone. If they remain for any reason, add an explicit `resetCache()` function for testing

### 9.4 Fix silent wikilink collision
- `pipeline/render-body.ts:59-62` — `linkMap` keys by `target|display`. If two wikilinks share the same target+display, only the last survives. Either:
  - Use an array of `PendingWikilink[]` per key, or
  - Switch to indexing by token position to guarantee 1:1 mapping

**Verification:** `npm run lint && npm run typecheck && npm test`

---

## Phase 10 — Final polish and documentation

**Goal:** Leave the codebase in a clean, maintainable state.

### 10.1 Run full test suite
- Ensure all tests pass after all phases
- Remove any `@ts-expect-error` or `eslint-disable` comments that were added during refactoring

### 10.2 Update SPEC.md / DSL.md if any behavior changed
- Phases 0-9 are intended to be behavior-preserving. Verify no output changes.

### 10.3 Final ESLint pass
- `npm run lint` — fix any new warnings introduced by refactoring

### 10.4 Commit in phase-boundary commits
- One commit per phase, with clear messages like:
  - `Phase 0: fix deps, remove dead code, clean config`
  - `Phase 1: extract shared fence wrapper`
  - ...etc

---

## Dependency graph (what blocks what)

```
Phase 0  (housekeeping)
   ↓
Phase 1  (fence wrapper) ←── needs fence.ts back
   ↓
Phase 2  (shared utilities) ←── can parallel with Phase 1
   ↓
Phase 3  (sync compile) ←── independent, can run after Phase 0
   ↓
Phase 4  (type safety) ←── after Phase 2 (color.ts exists)
   ↓
Phase 5  (error handling) ←── after Phase 4 (toErrorMessage exists)
   ↓
Phase 6  (diagram-svg refactor) ←── after Phase 4 (types tightened)
   ↓
Phase 7  (render-body refactor) ←── after Phase 6 (diagram-svg exports stable)
   ↓
Phase 8  (security) ←── after Phase 7 (injection sites extracted)
   ↓
Phase 9  (performance) ←── after Phase 5 (error handling stable)
   ↓
Phase 10 (polish)
```

Phases 1-3 can be parallelized after Phase 0.
Phases 4-5 must be sequential.
Phases 6-7 must be sequential.
Phases 8-9 can be parallel after Phase 7.
Phase 10 is always last.
