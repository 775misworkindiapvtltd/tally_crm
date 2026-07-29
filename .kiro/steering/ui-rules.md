---
inclusion: always
---

# Persistent UI Rules — DO NOT REVERT

These are explicit, repeated user instructions. When touching related code, do not
reintroduce the removed elements below, even if merging/copying code from an older
page implementation.

## Ageing Summary page — "All Data" tab (Receivables)

- Do **NOT** render a "Receivables Details" heading + "Search, filter, sort, resize,
  and manage visible columns" subtitle line above the grid. This was originally part
  of the old standalone "Receivables Dashboard" page and was explicitly removed by
  the user twice. The grid (`renderGrid('receivablesDashboard')`) must render
  directly inside `<section class="recv-dashboard-table">` with no heading above it.
- If this code is ever copied/merged again (e.g. from git history or another page),
  strip out any `.recv-dashboard-table-head` / `<h3>...Details</h3>` block first.

## General

- Before merging/porting markup from an older page implementation into a new one,
  check this file for elements the user has explicitly asked to be removed, and
  make sure they are not silently reintroduced.
