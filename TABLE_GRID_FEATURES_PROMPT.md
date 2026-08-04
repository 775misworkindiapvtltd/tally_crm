# Table / List View — Reusable Feature Prompt

This file is a **copy-paste-ready prompt** describing every table/list-view
feature already built into this app's generic grid engine (`GRID_DEFS` +
`renderGrid()` in `Common.html`, styles in `CSS.html`, calendar popup in
`DateRange.html`). Use the prompt block below whenever you (or an AI assistant)
need to build a new grid/list page here, or want to replicate the exact same
table behavior in another project.

It consolidates the same requirements already tracked individually in
`.kiro/steering/grid-ux-standards.md` — that file remains the authoritative,
per-item status/rule log for THIS repo. This file is the single reusable
**prompt** version of the same list, meant to be handed to an AI/developer as
one block of instructions.

---

## PROMPT — paste everything between the lines

```
Build a data table / list-view component with ALL of the following behavior.
Every point below must work together on the same table, not as isolated demos:

1. SORTING
   - Every column header is clickable to sort ascending/descending.
   - Clicking again on the same column reverses direction; a small ▲/▼ arrow
     next to the column label shows the active sort column and direction.
   - The sort arrow itself (not just the label text) is also clickable.
   - Sort state persists per user/browser so it survives a reload.
   - Sorting must NOT reset horizontal/vertical scroll position or the current
     page — re-render in place.

2. SEARCH / FILTER IN HEADER (per column)
   - Every header cell has its own inline search/filter icon that opens a
     small filter control directly under that column's label (not a separate
     global search box).
   - Text columns: plain text "contains" filter input.
   - Numeric columns: an operator-based filter (>, >=, <, <=, =, Between) with
     one or two number inputs — not a fixed Min/Max grid.
   - Date/timestamp columns: use the shared calendar date-range popup (see
     point 8), never a plain text/date input.
   - A column with an active filter is visually highlighted in its header
     (different background/underline) so active filters are obvious without
     opening every column.
   - Provide one "Reset filters" action that clears every column's filter at
     once.

3. COLUMN RESIZE
   - Every column has a drag handle on its right edge to resize width by
     dragging.
   - Resized widths persist per user/browser.
   - Use box-sizing:border-box on header/body cells so the resized width is
     exact (no drift from border/padding).
   - When a numeric column's operator filter needs more horizontal room than
     the column's current width (e.g. "Between" with two inputs), temporarily
     auto-widen just that column while its filter is open, then restore its
     original width when the filter closes.

4. COLUMN REORDER
   - A "Columns" menu lists every column with left/right (or up/down) buttons
     to move a column earlier/later in the display order.
   - The custom order persists per user/browser and must be used everywhere
     the header/body is rendered — never fall back to the original definition
     order once the user has customized it.

5. COLUMN HIDE / UNHIDE
   - The same "Columns" menu has a checkbox per column to show/hide it.
   - Hidden state persists per user/browser.
   - Every column is visible by default unless a column is explicitly marked
     hidden-by-default for a specific business reason.

6. HEADER FREEZE (STICKY HEADER)
   - The table header row(s) always stay pinned to the top of the table's own
     scroll container while only the body rows scroll underneath.
   - This requires the table's scroll container to have a bounded height
     (flex:1 inside a height-constrained flex column, or an explicit
     max-height) — position:sticky on <thead> silently fails without a real
     scrolling ancestor.
   - For pivot-style tables, also support LEFT-frozen leading columns (e.g.
     row label / totals columns) that stay pinned while scrolling horizontally
     through many data columns — computed left offsets, correct z-index
     layering so the frozen top-left corner cell stays above both the sticky
     header row and the sticky left column.

7. FOOTER / PAGINATION FREEZE (STICKY FOOTER)
   - The pagination bar (rows-per-page selector, page range text, prev/next/
     first/last buttons) always stays anchored to the bottom of the table's
     section — never floats away leaving blank space on short tables, and
     never disappears off-screen on tall tables.
   - Achieve this with a flex-column "sticky footer" (margin-top:auto on the
     pagination bar inside a flex column parent), not a fixed/absolute hack.

8. CALENDAR DATE-RANGE PICKER FOR DATE COLUMNS
   - Any date/timestamp column opens ONE shared calendar popup component
     (not a native <input type="date">) from its header search icon.
   - The popup shows: quick presets on one side (Today, This Week, This Month,
     This Quarter, This FY, Custom, etc.), two month calendars for picking a
     start/end date, and Apply/Clear actions in a footer.
   - The popup is a single reusable component shared by every date column in
     every table in the app, appended to <body> and positioned relative to
     whichever header icon opened it (so it is never clipped by a scrolling
     table container).
   - The header's calendar icon changes color/state once a range is applied,
     matching the same "active filter" treatment as text/number filters.

9. FONT / FONT FAMILY RULES
   - Use a distinct display font for headings (e.g. a geometric sans like
     'Space Grotesk') and a clean UI font for body text/inputs/buttons (e.g.
     'Inter').
   - Use a tabular/monospace-leaning font for numeric table cells (amounts,
     counts) so digits align vertically and don't visually jitter row to row
     (e.g. Tahoma/'JetBrains Mono'), with tight/negative letter-spacing so
     thousands separators don't add visible extra gaps.
   - Provide a global content text-size control (A- / A / A+, or similar) that
     scales table body cell font-size via one shared CSS variable/scale
     factor, without affecting header font size.
   - Numeric cells that would otherwise wrap when a column is narrowed should
     shrink their font size (within a min/max clamp) instead of wrapping to a
     second line.

10. NUMBER / CURRENCY FORMATTING
    - Right-align numeric/currency columns; left-align text columns.
    - Format currency with locale-appropriate thousands separators and no
      unnecessary decimal noise.
    - Support an optional "column total" shown in the header (sum of the
      currently visible/filtered rows) for key amount columns.
    - Support an optional heatmap treatment on a numeric column: cell
      background intensity scales with that cell's value relative to other
      visible rows (darker = higher, near-white = lower), with a smooth
      transition and a subtle separating border between cells.

11. ROW HIGHLIGHT / HOVER / EXPANDABLE ROWS
    - Every row highlights on hover.
    - Support an optional expandable master/detail row pattern: a small
      toggle inline with a cell's value expands a nested detail table below
      that row, reusing the exact same table engine (sort/filter/resize/hide)
      for the nested table. The expanded parent row stays visually
      highlighted while its detail is open.
    - Support an optional "sticky selection highlight" mode where every row
      sharing some business key (e.g. same customer) stays highlighted
      together after an action on any one of them.

12. PERSISTED PREFERENCES (PER USER)
    - Sort column/direction, active filters (optional), column widths, column
      order, and hidden columns should all persist per signed-in user across
      reloads (e.g. localStorage keyed by user + table identity).
    - Switching users must not leak one user's saved table preferences (or
      any cached data) into another user's session.

13. THEME / APPEARANCE-AWARE STYLING
    - Table header background and every other themable UI accent (buttons,
      active nav, focus rings) should derive from a small set of CSS
      variables tied to the app's active color scheme and light/dark mode —
      never hardcode a fixed hex color on anything that should react to a
      theme/appearance switch.

14. PAGINATION CONTROLS
    - Rows-per-page selector, current page range text ("1–25 of 240"), and
      First/Prev/Next/Last navigation buttons.
    - Disable Prev/First on the first page and Next/Last on the last page.
    - Use icon glyphs that render reliably in every browser/font (e.g. inline
      SVG chevrons) rather than relying on punctuation glyphs that some fonts
      omit.

15. RESPONSIVE / MOBILE FALLBACK
    - On narrow screens, replace the table with a stacked card-per-row list
      (each card shows the row's key fields as label/value pairs) instead of
      forcing horizontal scrolling on a dense table.
    - Pagination controls remain available in the mobile card view.

16. EMPTY / LOADING STATES
    - Show a clear, consistent "no matching rows" state when filters return
      nothing, distinct from the initial loading/skeleton state before any
      data has arrived.

Implement all of this as ONE reusable/generic table engine (config-driven
column definitions), not copy-pasted per page, so every list/table page in the
app automatically gets identical behavior.
```

---

## Where this is actually implemented in this repo (for reference)

| Feature | Where |
| --- | --- |
| Sorting | `renderGrid()` header click handlers, `st.sortKey`/`st.sortDir` — `Common.html` |
| Search / filter in header | `.th-filter`, `.th-num-filter`, `filterType` on each column — `Grids.html` columns, `Common.html` engine, `CSS.html` |
| Column resize | `.resize-handle`, `st.widths`, `persistGridPrefs_()` — `Common.html` / `CSS.html` |
| Column reorder | `.col-shift` buttons, `st.order` — `Common.html` / `CSS.html` |
| Column hide/unhide | `.dt-colmenu`, `st.hidden` — `Common.html` / `CSS.html` |
| Header freeze | `table.dt thead th{position:sticky;top:0;}` + bounded `.dt-scroll` — `CSS.html` |
| Left-frozen pivot columns | `.scp-sno` / `.scp-total` / `.scp-pct` / `.scp-cat`, `.apv-name` — `CSS.html` |
| Footer freeze (pagination) | `.dt-pagination{margin-top:auto;}` — `CSS.html` |
| Calendar date-range picker | `#drPopupRoot`, `.dr-*` classes — `DateRange.html` / `CSS.html`, wired via `{date:true}` columns in `Grids.html` |
| Font families | `body{font-family:'Inter',...}`, `h1,h2,h3,.disp{font-family:'Space Grotesk',...}`, `Tahoma`/`'JetBrains Mono'` on numeric cells — `CSS.html` |
| Font-size (A-/A/A+) control | `--data-scale` variable, `.topbar-fontsize` — `Common.html` / `CSS.html` (see steering item #13 for a pending placement change) |
| Number/currency formatting, header totals, heatmap | `num`, `headerTotal`, `heatmap` column flags — `Grids.html`, `heatmapCellStyle_()` — `Common.html` |
| Row highlight / expandable rows | `.exp-toggle`, `.exp-row-open`, `.row-highlighted`, `expandable`/`renderDetail`/`highlightKey` — `Grids.html` / `Common.html` / `CSS.html` |
| Persisted per-user preferences | `persistGridPrefs_()` / `applyPersistedGridPrefs_()`, `gridPrefsStorageKey_()` — `Common.html` |
| Theme-aware header color | `background:var(--accent)` on every table header — `CSS.html` |
| Pagination controls | `.dt-pagination`, inline SVG chevrons — `Common.html` / `CSS.html` |
| Responsive mobile card fallback | `.mcard-list`, `.mcard` — `Common.html` / `CSS.html` |
| Empty state | `.empty-state` — `Common.html` / `CSS.html` |

For the detailed per-item **status (done/partial/pending) and enforcement
rules** specific to this codebase, see
`.kiro/steering/grid-ux-standards.md` — this prompt file is the portable
"build it from scratch" version of the same requirements.
