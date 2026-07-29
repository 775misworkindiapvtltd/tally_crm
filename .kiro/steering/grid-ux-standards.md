---
inclusion: always
---

# Grid / Table UX Standards — Finance 360° App

Consolidated list of explicit user requirements for the **sidebar, page header, and
every data grid** (`renderGrid()` in `Common.html`) across the app. Each item below
records: the requirement in the user's own words, the **current status** as of this
writing, and the **rule to enforce** going forward so none of this is silently
regressed when new pages/grids are added or existing code is refactored.

Status legend: ✅ Done &nbsp;·&nbsp; ⚠️ Partially done / needs a change &nbsp;·&nbsp; ❌ Not done yet

---

## 1. Left Bar (Sidebar)

**Requirement:** Sidebar shrinks to icon-only on desktop, expands on hover; stays
usable and never breaks layout.

**Status:** ✅ Done — `.sidebar` rests at `64px` (icon + small caption underneath
each nav item) and expands to `236px` on `:hover` via pure CSS (`@media
(min-width:981px)` block in `CSS.html`). No JS state needed. Mobile keeps its
separate off-canvas open/close behavior untouched.

**Rule:** Any new nav item markup MUST wrap its label in `<span class="n-lbl">`
(see `renderShell()` in `Common.html`) — a bare text node will not be hidden/
captioned correctly in the collapsed rail. Do not reintroduce a JS-driven
collapse/expand state; the hover-only CSS approach is intentional (simpler, never
gets stuck in the wrong state).

---

## 2. Header & List Table (general grid shell)

**Requirement:** Every list/table across the app should share the same header
look, feel, and controls (Appearance-aware, sortable, searchable, resizable,
reorderable, paginated).

**Status:** ✅ Done for every grid built on the generic engine — `GRID_DEFS` +
`renderGrid()` in `Common.html`. New reports should always be added as a
`GRID_DEFS` entry + `registerPage(key, () => renderGrid(key))`, never a bespoke
hand-rolled table, unless there's a real structural reason (e.g. the Ageing Party
Pivot, Sales/Expense Duration pivots).

**Rule:** Table header background = `var(--accent)` (Appearance color scheme),
header text = `#fff`. Header cell content is vertically centered
(`justify-content:center` on `.th-inner`, which is `flex-direction:column`).

---

## 3. Search in Header — UI/UX

**Requirement:** Every column should be searchable directly from its header.

**Status:** ✅ Done — each header cell has a `search-ic` (🔍) that opens an
inline filter row (`.th-filter`) below the label: text input for text columns,
a number-range for numeric columns, and the shared calendar popup
(`DateRange.html`) for date columns. A `filter-active` state highlights the
column header once a filter is applied.

**Rule:** Any new column type must reuse the existing `filterType` config
(`'text'` / `'number-range'` / `'date'`) rather than inventing a new filter UI —
keeps every grid's search experience identical.

---

## 4. Appearance

**Requirement:** A single color-scheme/light-dark system that visibly recolors
the whole app (sidebar, header, buttons, table headers, avatar, brand icon).

**Status:** ✅ Done — `displayMode` (`light`/`dark`/`system`) + `colorScheme`
(37 palettes + "Surprise Me") drive 5 root CSS variables
(`--color-primary[-hover/-light/-glow/-soft]`), which every component derives
`--accent`/`--accent-dark`/`--accent-tint`/`--accent-tint2` from.

**Rule:** Never hardcode a color (hex) on anything that should react to
Appearance — always use `var(--accent)` / `var(--accent-dark)` /
`var(--accent-tint)` / `var(--accent-tint2)`, and prefer these over
`--color-primary*` directly, since only `--accent*` also swaps for dark mode
(see the `.avatar`/`.brand-icon` fix history in git log if this regresses again).

---

## 5. Date in Header

**Requirement:** Any date/timestamp column should open a proper calendar-style
date-range picker from its header, not a plain text/date input.

**Status:** ✅ Done — `DateRange.html`'s shared popup (`#drPopupRoot`) is used by
every column flagged `{date:true}` in its `GRID_DEFS` — presets on the left, two
month calendars, Apply/Clear footer.

**Rule:** Never add a plain `<input type="date">` for a grid column filter — mark
the column `date:true` and let the shared `DateRange.html` component handle it,
so every date column across every grid behaves identically.

---

## 6. Sort in Header

**Requirement:** Every column sortable by clicking its header/sort arrow.

**Status:** ✅ Done — clicking a `.th-label` or its `.sort-ic` toggles
ascending/descending; the active sort column/direction is shown with a
▲/▼ arrow and is persisted per user (see §"Remembered Grid Settings" in
`Common.html`).

**Rule:** Do not add a column that can't be sorted unless it's a pure action
column (e.g. "Mark Follow Up" button) — mark those `sortable:false`-equivalent
by simply not wiring a sort handler, not by breaking the shared sort logic for
every other column.

---

## 7. Sort/Search Should NOT Reset Horizontal Scroll

**Requirement:** "Sort kare ya search kare to left na ho scroll bar" — sorting or
filtering a wide table must not snap the horizontal scroll position back to the
far left.

**Status:** ⚠️ Partially done — `render()` in `Common.html` already
saves/restores **vertical + horizontal** scroll for `.content`, `.dt-scroll`,
and `#sidebarNav` around every re-render (`savedContentScroll` /
`savedDtScroll` / `savedNavScroll`, restored via `restoreScroll()`). **This
covers most cases already**, but has NOT been specifically re-verified against
every sort/search action path on every grid (some column-specific filter/sort
handlers may call `render()` through a code path that bypasses this, or reset
`st.page=1` in a way that indirectly changes what's visible). **Needs a
dedicated pass**: click a sort arrow / apply a filter on a horizontally-scrolled
wide grid (e.g. Sales Report, Duration pivots) and confirm the scroll position
does not jump.

**Rule going forward:** Any new action handler that calls `render()` after a
sort/filter/search change must NOT manually reset `.dt-scroll`'s `scrollLeft` —
let the existing save/restore in `render()` handle it. If a fix is needed, it
belongs in `render()`'s scroll-preservation block (already the single source of
truth for this), not scattered per-action.

---

## 8. Column Hide / Unhide

**Requirement:** Any column can be hidden/shown from a "Columns ▾" menu, and the
choice is remembered.

**Status:** ✅ Done — `.dt-colmenu` (opened via the toolbar's "Columns ▾"
button) lists every column with a checkbox; hidden columns are tracked in
`st.hidden` (a `Set`) and persisted per signed-in user via
`persistGridPrefs_()`/`applyPersistedGridPrefs_()` (localStorage, keyed by
`gridPrefsStorageKey_()`).

**Rule:** A column should only be hidden by default if explicitly requested —
otherwise every column defined in `GRID_DEFS[key].cols` starts visible.

---

## 9. Column Resize

**Requirement:** Any column's width can be dragged wider/narrower, and the width
is remembered.

**Status:** ✅ Done — each header cell has a `.resize-handle` (drag handle) on
its right edge; the new width is written to `st.widths[col.key]` and persisted
the same way as hidden columns (`persistGridPrefs_()`). The Sales/Expense
Duration pivots have their own separate width-persistence
(`persistPivotColWidths_()`) since they're bespoke tables, not the generic
engine.

**Rule:** Resize handles must stay outside the flex-centered label content (see
comment in `Receivables.html`'s Ageing Party Pivot: "resize-handle sits OUTSIDE
apv-th-inner…") so dragging never fights with header centering/layout.

---

## 10. Column Reorder (Aage-Peeche Karna)

**Requirement:** Columns can be moved earlier/later in the column order, and the
order is remembered.

**Status:** ✅ Done — the "Columns ▾" menu's `.col-shift` left/right buttons
move a column's position in `st.order`; persisted the same way as hidden
columns/widths.

**Rule:** Column order must always be read from `st.order` when rendering the
header/body — never assume `GRID_DEFS[key].cols`' original array order once a
user has customized it.

---

## 11. Header & Pagination Must Stay Fixed (Never Disappear)

**Requirement:** The table header row and the bottom pagination bar must always
stay visible/anchored — never scroll away or vanish, regardless of screen size
or row count.

**Status:** ✅ Done —
- Header: `table.dt thead th{position:sticky;top:0;...}` inside `.dt-scroll`
  (the ONLY bounded-height scrolling ancestor — this is what makes `sticky`
  actually work; see the comment above `.dt-scroll` in `CSS.html`).
- Pagination: `.dt-pagination{...margin-top:auto;...}` — the flexbox
  "sticky footer" trick, so it's pinned to the bottom of its flex column
  parent (`.content-zoom` or a page section) whenever there's extra vertical
  space, and simply follows a tall table when there isn't.

**Rule:** Any new page/grid wrapper MUST give `.dt-scroll` a bounded height
(`flex:1` inside a height-constrained flex column, or an explicit
`max-height`) — without that, `position:sticky` on `<thead>` silently stops
working and the header scrolls away with the data. Never wrap a grid in a
plain `overflow:visible` container.

---

## 12. Auto-Refresh Every 5 Minutes (Silent, No User Interruption)

**Requirement:** "AUTO REFRESH DATA HAR 5 MIN MEIN REFRESH HOTA RAHE N USER KO
PTA NA LAGE" — data should silently refresh in the background every 5 minutes
without any visible interruption (no toast spam, no scroll/position jump, no
losing what the user was doing).

**Status:** ⚠️ Partially done — an auto-refresh timer already exists
(`startAutoRefreshTimer_()` in `Common.html`), reusing the exact same
`refreshData()` the sidebar's "Sync with Tally" button calls (same chunk fetch,
same cache write, silent=true so no toast), and every render already preserves
scroll position (see §7/§11) so it shouldn't visibly disrupt the user. **BUT the
interval is currently `10 minutes` (`AUTO_REFRESH_INTERVAL_MS = 10*60*1000`),
not 5** — this needs to be changed to `5*60*1000` to match the requirement.

**Rule:** Change `AUTO_REFRESH_INTERVAL_MS` to `5*60*1000`. Keep it silent
(`refreshData(null, true)` — the `true` suppresses the toast). Never surface a
"Refreshing…" banner/spinner for the AUTOMATIC tick — only the manual "Sync
with Tally" button and the topbar's own small refresh pill should show any
in-progress indicator, per the "user ko pta na lage" instruction. Do not skip a
tick just because the user is mid-filter/mid-sort — the scroll/state
preservation in `render()` already protects against any visible disruption.

---

## 13. A- / A / A+ (Font Size Control) — Must Sit Between Header and Pagination, Not in the Topbar

**Requirement:** "A- A A+ YE SIRF HEADER N PAGINATION KE BEECH MEIN USE HO" — the
content-size control should only appear between a grid's own header and its
pagination footer (i.e. as part of each grid's own toolbar/chrome), not as a
single global control sitting in the app's top navigation bar.

**Status:** ❌ Not done yet — `.topbar-fontsize` (the `A- / A / A+` control)
currently lives in the **global topbar**, next to the dark/light toggle and the
Appearance trigger (`renderShell()` in `Common.html`), applying one global
`--data-scale` CSS variable that every grid's body cells already read
(`font-size:calc(...*var(--data-scale))`).

**Rule / change needed:** Move the `A- / A / A+` control out of `.topbar-right`
and into each grid's own chrome, positioned between the header (`<thead>` /
toolbar row) and the pagination footer (`.dt-pagination`) — e.g. as a small
control row directly above `.dt-pagination`, or folded into the toolbar's right
side just above the table. The underlying mechanism (writing `--data-scale`
via `document.documentElement.style.setProperty`) can stay global/shared; only
the **visual placement** of the buttons needs to move, since it's one shared
zoom level for the whole app already, per the original design.

---

## 14. Additional Items Worth Adding (not explicitly asked, but common gaps for this kind of grid system)

- **Reset Filters** — ✅ already added on every grid (`reset-grid-filters`
  action), plus the Ageing Party Pivot's search and the Duration pivots'
  cross-filter. Keep extending this to any new bespoke (non-generic-engine)
  table going forward.
- **Empty state consistency** — every grid should show the same
  `.empty-state` look ("No matching rows" / "Filters adjust karke dekho, ya
  abhi koi data nahi hai") rather than a blank table body.
- **Row hover highlight** — already present (`table.dt tbody tr:hover`); keep
  consistent across new grids.
- **Loading/skeleton state while syncing** — currently a plain spinner
  (`.empty-state` with `.spinner`) when there's no cached data yet; consider a
  skeleton-row placeholder instead for a smoother first-load feel.
- **Sticky/frozen leading column(s)** — already implemented for the
  Sales/Expense Duration pivots (`position:sticky` on S.No/Total/%/Category) —
  worth considering for any other very-wide grid (e.g. Sales Report) if it
  ever grows more columns.
- **Export (CSV/Excel/PDF)** — not implemented on any grid yet; frequently
  requested for financial data — flagged here as a candidate follow-up, not
  yet built.
- **Keyboard shortcuts** — no keyboard navigation/shortcuts (e.g. `/` to focus
  a search, `Esc` to close an open filter/modal) exist yet.
- **Multi-column sort** — current sort is single-column only; not requested,
  but a common ask once single-column sort is in daily use.
- **Accessibility** — most controls lack `aria-label`s beyond what's already
  on `.topbar-fontsize`/`role="group"`; worth a pass if this app is used by
  assistive-tech users.

---

## How to Use This File

When building or refactoring ANY grid/report/page:
1. Check the relevant section above before writing new markup/CSS.
2. If a rule here would be violated, either follow the rule or explicitly ask
   the user before deviating.
3. When an item's status changes (⚠️/❌ → ✅), update this file in the same
   commit as the code change, so it stays a reliable source of truth.
