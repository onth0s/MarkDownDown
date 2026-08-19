# AGENTS.md

- Run ESLint after a significant code change or addition.

- NEVER add left-side vertical border highlights/strips (`border-left`, accent bars) to active sidebar items, TOC links, or search results. Use standard background and text color styling only.

- WINDOWS ONLY, POWERSHELL FIRST: Never use `++` in executable CLI command names or bin shortcuts (e.g. `markdown++` breaks in PowerShell parser due to the `++` operator). Use `mdd` and `markdowndown` for CLI/bin commands. Preserve `Markdown++` and `MD++` in text, docs, and conceptual branding only.

- NAVIGATION PILL POSITIONING: The navigation history pill (`.nav-history-bar`) MUST ALWAYS be positioned at the bottom-left of the content area to the RIGHT of the 280px sidebar (e.g., `left: calc(max(0px, (100vw - 1500px) / 2) + 280px + 20px)` on desktop, and `left: max(16px, env(safe-area-inset-left))` on mobile). NEVER move it inside the sidebar or to the bottom-right corner unprompted.

