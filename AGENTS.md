# AGENTS.md

- Run ESLint after a significant code change or addition.

- NEVER add left-side vertical border highlights/strips (`border-left`, accent bars) to active sidebar items, TOC links, or search results. Use standard background and text color styling only.

- WINDOWS ONLY, POWERSHELL FIRST: Never use `++` in executable CLI command names or bin shortcuts (e.g. `markdown++` breaks in PowerShell parser due to the `++` operator). Use `mdd` and `markdowndown` for CLI/bin commands. Preserve `Markdown++` and `MD++` in text, docs, and conceptual branding only.

- NAVIGATION PILL POSITIONING: The navigation history pill (`.nav-history-bar`) MUST ALWAYS be positioned OUTSIDE the sidebar to the RIGHT (in the main content column). On desktop, compute its offset dynamically from `sidebar.getBoundingClientRect().right + 20px` (or `left: calc(max(0px, (100vw - 1500px) / 2) + 280px + 20px)`), and `left: max(16px, env(safe-area-inset-left))` on mobile. NEVER place it inside the sidebar or on top of the sidebar under any circumstances.

- CUSTOM SCROLLBARS: NEVER alter, widen, or add rounded borders/scrollbar-color overrides to the custom scrollbars in `templates/style.css`. Preserve the exact custom `2px` sharp, unrounded scrollbars (`width: 2px; height: 2px; border: none; border-radius: 0; background: var(--accent);`) across sidebar, code blocks, tables, and diagrams.

