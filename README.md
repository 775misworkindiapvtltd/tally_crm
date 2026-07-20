# Tally CRM Dashboard

A Google Apps Script web app that turns your Tally-export Google Sheet into a
responsive (desktop + mobile) CRM-style dashboard: login, receivables,
payables, expense/receipt/payment vouchers, an ageing/overdue report, and a
printable/downloadable PDF party ledger.

## Pages

- **Dashboard** — Receivables / Payables / Expense / Net-position summary
  cards, top-party bar charts, ageing snapshot, recent Receipt/Payment lists.
- **Receivables / Payables / Expense / Receipt / Payment** — sortable,
  filterable, resizable, paginated grids on desktop; card-list view on
  mobile.
- **Overdue / Ageing** — 0-30 / 31-60 / 61-90 / 91-180 / 180+ day buckets,
  toggle between Receivables and Payables.
- **Party Ledger** — party picker + full statement (Opening balance →
  Voucher lines → Closing balance), with a **Print / Download as PDF**
  button (uses the browser's print dialog → "Save as PDF").

All pages are gated per-user via columns on the `LOGIN PAGE` sheet tab.

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
NAME | ID | PASSWORD | DASHBOARD | EXPENSE | PAYABLES | RECEIVABLES | RECEIPT | PAYMENT | LEDGER | OVERDUE
```

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

## Notes / assumptions

This app was built from the Google Sheet tab names, column headers, and
sample rows shared in chat (not from the original dashboard screenshots,
which never successfully attached). The visual layout follows a standard
Tally ledger format. The data layer (`Code.gs`) is fully decoupled from the
presentation layer, so the look can be restyled later without touching how
data is read from the sheet.
