# Finance 360° — Tally CRM Dashboard

A Google Apps Script web app that turns your Tally-export Google Sheet into a
responsive (desktop + mobile) "Finance Command Center" — modeled on the
Finance 360° dashboard reference design (KPI cards with period-over-period
comparison, trend/ageing/cash-flow charts, working filters, and every
sub-report reachable from the sidebar).

## Pages

- **Dashboard (Finance Command Center)** — filter bar (Company / Branch /
  Financial Year / Sales Person / Date range presets / Compare toggle), 8 KPI
  cards with vs-previous-period %, Sales vs Expenses trend chart, Receivable
  & Payable ageing donuts, Cash Flow panel, Top Customers/Vendors tables,
  Expense by Category, Recent Receipts, Upcoming Dues, Sales Topline donut,
  and Quick Actions.
- **Receivables**: Receivables Dashboard, Ageing Summary, Customer List,
  Receipt List, Collection Analysis (DSO + collection efficiency), Follow Up
  List, Credit Notes.
- **Payables**: Payables Dashboard, Ageing Summary, Vendor List, Payment List.
- **Finance**: Sales Dashboard, Expenses Dashboard, Cash Flow, Profit & Loss,
  Balance Sheet, Reports (hub linking every report).
- **Party Ledger** — party picker + full statement (Opening balance →
  Voucher lines → Closing balance), with a **Print / Download as PDF**
  button (uses the browser's print dialog → "Save as PDF").
- **Executive Summary**, **Alerts** (auto-generated from overdue bills),
  **Settings**.

All filters (Company/Branch/FY/Sales Person/Date range/Compare) are wired
directly into every dashboard/report's calculations — not just UI decoration.

**Login is simple username/password only** — there is no per-page permission
matrix. Every user who successfully logs in sees every page in the sidebar.

> **Note:** The AI Insights panel shown in the original Finance 360°
> reference screenshot was intentionally excluded from this build, per
> request.

## Required Google Sheet tabs

| Tab name      | Purpose                                             |
|---------------|------------------------------------------------------|
| `LOGIN PAGE`  | User ID / Password / per-page YES-NO permissions     |
| `EXPENSE`     | Expense voucher lines                                |
| `PAYABLES`    | Outstanding payable bills                            |
| `RECEIVABLES` | Outstanding receivable bills                         |
| `Receipt`     | Receipt vouchers (credit + debit ledger legs)        |
| `PAYMENT`     | Payment vouchers (same layout as Receipt)            |
| `Balance`     | Party ledger source — one row per voucher line, with opening/closing filled on first/last row per party |

Exact column order for every tab is documented at the top of `Code.gs`.

### LOGIN PAGE — required columns

```
NAME | ID | PASSWORD | ROLE
```

- `ROLE` is optional free text shown under the user's name in the top-right
  corner (e.g. "Finance Manager"). Defaults to "Team Member" if left blank.
- No per-page permission columns are needed — every user who logs in sees
  every page. If your sheet still has old columns like `DASHBOARD`,
  `RECEIVABLES`, `FINANCE`, `OVERDUE`, etc. from an earlier version, they are
  simply ignored now and can be left in place or deleted.

## Deploying

1. Create/open an Apps Script project bound to your Google Sheet (Extensions
   → Apps Script).
2. Copy each file in this repo into the Apps Script project with the same
   name (`Code.gs`, `Index.html`, `CSS.html`, `Common.html`, `Dashboard.html`,
   `Grids.html`, `Overdue.html`, `Ledger.html`, `appsscript.json`).
3. Deploy → New deployment → type **Web app** → Execute as **Me** → Who has
   access **Anyone** → Deploy.
4. Open the `/exec` URL it gives you — that's your dashboard, desktop and
   mobile both use the same URL.

## Notes / assumptions (Finance 360° rebuild)

This app was rebuilt to match a "Finance 360° — Finance Command Center"
reference screenshot (minus its AI Insights panel, excluded per request).
Some figures are derived rather than read from a dedicated register sheet,
since the source spreadsheet only has `EXPENSE`, `PAYABLES`, `RECEIVABLES`,
`Receipt`, `PAYMENT` and `Balance` tabs:

- **Sales / Purchase / Credit Notes** are derived from the `Balance` tab's
  `Voucher Type` column (matched against `/sale/i`, `/purchase/i`,
  `/credit\s*note/i`). If your Tally export uses different wording for these
  voucher types, adjust the regexes at the top of `Dashboard.html`
  (`voucherSales_`, `voucherPurchase_`, `voucherCreditNote_`).
- **Company / Branch filters** are UI-only placeholders unless you add a
  `Company`/`Branch` column to your sheet tabs — wire them into `Code.gs`'s
  row mappers to make them filter real data.
- **Cash in Hand / Bank** and the Cash Flow page's opening/closing balances
  are derived from Receipt/Payment bank ledger legs, not a dedicated
  Cash/Bank book — treat as indicative, reconcile against Tally directly.
- **Sales Topline split** (Domestic/Export/Other) on the dashboard is an
  illustrative 70/24/6 split of total sales pending a real data source.
- **DSO (Days Sales Outstanding)** = (Outstanding Receivables ÷ Sales in
  period) × days in period — standard formula, recalculates with filters.
- **Follow Up "mark as followed up"** is client-side only (resets on
  refresh/reload) — there's no sheet column to persist it yet.

The data layer (`Code.gs`) is fully decoupled from the presentation layer,
so figures/formulas above can be refined without touching the UI, and the
UI can be restyled without touching how data is read from the sheet.

## ⚠️ IMPORTANT: How to actually update your live app

**Editing/saving files in the Apps Script editor does NOT update your published
`/exec` URL by itself.** This is the #1 reason a fix "doesn't work" even though
the code is correct — the live app is still running an old deployment.

Every time you paste in updated code, you must:
1. Click **Deploy → Manage deployments**
2. Click the pencil/edit icon next to your existing "Web app" deployment
3. Under **Version**, choose **New version**
4. Click **Deploy**

The sidebar footer of the app shows a **"Build: ..."** version string (from
`APP_BUILD` at the top of `Common.html`). If that string doesn't match what
you expect after a fix, your live deployment hasn't picked up the new code
yet — repeat the steps above.

### Sales vs Expenses Trend chart

- Shows the **last 12 months, starting with the current month** (oldest month on the
  left, current month on the right).
- **Sales** (blue line) — from the `SALES` sheet: **column A** = sale date, **column M**
  = sale amount (same column used for the Total Sales KPI).
- **Expenses** (red line) — from the `EXPENSE` sheet: **column B** = date, **column K**
  = amount. Read positionally by column letter, separate from the Expense Vouchers grid
  (which still reads EXPENSE by header name for its other columns).

## Dashboard data sources (per user instruction, 21-Jul-2026)

- **Total Sales** (Dashboard KPI card) is now read from a dedicated **`SALES`** sheet
  tab, **column M** (13th column) = sale amount, summed across all rows. **Column N**
  (14th column) = product category — used to break down the "Sales Topline" donut by
  category if present, otherwise it falls back to an illustrative 70/24/6 split.
  Both are read **positionally by column letter**, not by header text, so renaming the
  header cell text will never break this figure.
- **Total Receivables** (Dashboard KPI card, labelled "Total Receivables") is read from
  the **`RECEIVABLES`** sheet, **column K** (11th column) = Pending Amount, summed
  across all rows. Also read positionally by column letter for the same reason.
- Add a `SALES` tab to your spreadsheet with at least 14 columns (A through N) for this
  to work — column M must be numeric.

## Performance notes

- Login only reads the `LOGIN PAGE` sheet. All other tabs (`EXPENSE`,
  `PAYABLES`, `RECEIVABLES`, `Receipt`, `PAYMENT`, `Balance`) are read once,
  right after a successful login, in a single `getBootstrapData()` call —
  and again only when you click **"Sync with Tally"** in the sidebar.
- Clicking between sidebar pages is instant (no server call) since there is
  no per-page permission check anymore — the already-loaded data is just
  re-rendered for the new page.
- The `Balance` tab (often the largest tab) is read from the sheet only
  once per sync and reused for both the Party Ledger list and the
  Sales/Purchase/Credit Note figures, instead of being read twice.
- Bootstrap data (everything the dashboard needs) is now cached server-side for
  45 seconds via `CacheService`. Logging in or reloading the page within that
  window serves the cached copy instantly instead of re-reading all 8 tabs.
  Clicking **"Sync with Tally"** always bypasses the cache and re-reads live.
- If the app still feels slow to you, the most likely cause is sheet size —
  Apps Script's `getDataRange().getValues()` cost scales with total rows
  across all 7 tabs. Consider archiving old financial years to a separate
  spreadsheet/tab if any tab has grown very large.
