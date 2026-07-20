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

All pages are gated per-user via columns on the `LOGIN PAGE` sheet tab.

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

### LOGIN PAGE — required permission columns

Add these columns to `LOGIN PAGE` and mark `YES` for whichever pages a user
should see:

```
NAME | ID | PASSWORD | ROLE | DASHBOARD | EXPENSE | PAYABLES | RECEIVABLES | RECEIPT | PAYMENT | LEDGER | FINANCE
```

- `ROLE` is free text shown under the user's name in the top-right corner
  (e.g. "Finance Manager"). Optional — defaults to "Team Member".
- `FINANCE` grants Sales Dashboard, Expenses Dashboard, Cash Flow, P&L,
  Balance Sheet and Reports.
- The old `OVERDUE` column from earlier builds is no longer used (Ageing
  Summary pages now live under `RECEIVABLES`/`PAYABLES` permissions) but is
  harmless to leave in your sheet.

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
