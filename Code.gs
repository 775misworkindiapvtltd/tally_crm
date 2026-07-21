/**
 * FINANCE 360° — Tally CRM Dashboard — Google Apps Script web app
 * =============================================================
 * Files in this Apps Script project:
 *   Code.gs        (this file — server side)
 *   Index.html     (root HTML shell)
 *   CSS.html       (all styles — desktop + mobile responsive, Finance 360 dark-sidebar theme)
 *   Charts.html    (Chart.js-based combo/donut chart helpers)
 *   Filters.html   (top filter bar: Company/Branch/FY/Sales Person/Date range/Compare)
 *   Common.html    (state, login, shell/nav, generic grid engine, helpers)
 *   Dashboard.html (Finance Command Center — KPI cards, trend/ageing/cash-flow charts, tables)
 *   Grids.html     (Expense / Payables / Receivables / Receipt / Payment grids + column defs)
 *   Receivables.html (Receivables Dashboard, Ageing Summary, Customer List, Collection
 *                     Analysis, Follow Up List, Credit Notes)
 *   Payables.html  (Payables Dashboard, Ageing Summary, Vendor List)
 *   Finance.html   (Sales Dashboard, Expenses Dashboard, Cash Flow, P&L, Balance Sheet, Reports)
 *   Misc.html      (Executive Summary, Alerts, Settings)
 *   Ledger.html    (party ledger statement + printable/downloadable PDF view)
 *
 * REQUIRED GOOGLE SHEET TABS (names must match EXACTLY):
 *
 *   LOGIN PAGE  -> Column A = Name (optional) | Column B = ID | Column C = Password
 *                  (read POSITIONALLY by column letter, per explicit user instruction —
 *                  no permission matrix at all, every logged-in user sees every page)
 *
 *   EXPENSE     -> TIMESTAMP | DATE | VOUCHER NUMBER | PARTY NAME | Group |
 *                  Sub_Group | DESIGN NUMBER | ITEM NAME | QTY | RATE | AMOUNT | TYPE
 *
 *   PAYABLES    -> TIMESTAMP | Bill_Date | Bill_Ref_No | Party_Name | Party_Group |
 *                  Sub_Group | Main_Group | Sales Person | Phone No. | Payment Terms |
 *                  Closing_Balance | Due_Date | Overdue_Days
 *
 *   RECEIVABLES -> TIMESTAMP | Bill_Date | Bill_Ref_No | Party_Name | Party_Group |
 *                  Sub_Group | Main_Group | Sales Person | Phone No. | Payment Terms |
 *                  Pending Amount | Due_Date | Overdue_Days
 *                  (read POSITIONALLY by column letter, NOT by header text — column K
 *                  (11th column) is always treated as Pending Amount, per explicit user
 *                  instruction. This makes it immune to header text being renamed/retyped.)
 *
 *   SALES       -> Column A = TimeStamp/Sale Date | ... | "TOTAL PRICE" column = Sale
 *                  Amount | "CATEGORY" column = Product Category | ...
 *                  (Column A is read positionally, since it's always the first column.
 *                  The amount and category columns are located by SEARCHING the header
 *                  row for text containing "TOTAL PRICE"/"AMOUNT" and "CATEG"
 *                  respectively — NOT a hardcoded column letter. This is deliberate: the
 *                  real sheet has 2 HIDDEN columns (I, J) between the visible columns,
 *                  which silently shifts every fixed column-letter guess. Header-text
 *                  search is immune to hidden/inserted/reordered columns.)
 *
 *   Receipt     -> Timestamp | Voucher_Number | Date | Group | Sub_Group |
 *                  Ledger_Name(Cr) | Ledger_Amount(Cr) | Bill_Type | Bill_Name | Bill_Amount |
 *                  Type | Ledger_Name(Dr) | Ledger_Amount(Dr) | Bank_Party_Name |
 *                  Transaction_Type | Inst_No | Inst_Date | Bank_Name
 *                  (read POSITIONALLY — header repeats "Ledger_Name"/"Ledger_Amount" twice)
 *
 *   PAYMENT     -> same 18 columns/layout as Receipt (positional read)
 *
 *   Balance     -> Timestamp | Name | Alias | Subgroup | Group | Main Group | GUID |
 *                  Master ID | Alter ID | Bill By Bill | Credit Period | Credit Limit |
 *                  State | Country | Pincode | Email | Email CC | Contact Person | Mobile |
 *                  Opening Date | Opening Particular | Opening Debit | Opening Credit |
 *                  Opening Balance | Voucher Date | Voucher Particular | Voucher Type |
 *                  Voucher No | Voucher Debit | Voucher Credit | Closing Date |
 *                  Closing Particular | Closing Debit | Closing Credit | Closing Balance
 *                  (this is the party ledger source — one row per voucher line per party,
 *                  Opening filled on the first row for a party, Closing filled on the last)
 *
 * NOTE ON ASSUMPTIONS (Finance 360° dashboard rebuild):
 *  - There is no dedicated "Sales"/"Purchase" register sheet in the source spreadsheet,
 *    so Sales/Purchase/Collections/Payments figures for the KPI cards and the Sales vs
 *    Expenses chart are derived from the Balance tab's voucherType field (Sales/Purchase/
 *    Receipt/Payment/Credit Note/Debit Note) plus the EXPENSE, Receipt and PAYMENT tabs.
 *    If your Balance tab's voucherType text differs from Tally's defaults, adjust the
 *    VOUCHER_TYPE_MATCH regexes below.
 *  - "Company" and "Branch" filters are UI-only unless your sheet rows carry a Company/
 *    Branch column — add a `Company` and/or `Branch` column to Balance/EXPENSE/Receipt/
 *    PAYMENT and the filter will automatically start filtering by it (see pick_ fallback).
 *  - "Cash in Hand / Bank" and Opening/Closing cash-flow balances are derived from the
 *    Receipt/PAYMENT bank ledger legs for the selected period, not from a dedicated
 *    Cash/Bank book — treat these as indicative, reconcile against Tally directly for
 *    statutory reporting.
 *  - AI Insights panel from the reference screenshot was intentionally EXCLUDED per request.
 *
 * Deploy: Deploy > New deployment > type "Web app" > Execute as "Me" > Who has access
 * "Anyone" > Deploy.
 */

/* ---- Sheet name constants ---- */
var SHEETS = {
  login:       'LOGIN PAGE',
  expense:     'EXPENSE',
  payables:    'PAYABLES',
  receivables: 'RECEIVABLES',
  receipt:     'Receipt',
  payment:     'PAYMENT',
  balance:     'Balance',
  sales:       'SALES'
};

function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Tally Dashboard')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/* ============================= GENERIC SHEET READ ============================= */
function sheetToObjects_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) return [];
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0].map(function (h) { return String(h).replace(/\s+/g, ' ').trim(); });
  return data.slice(1)
    .filter(function (row) { return row.some(function (c) { return c !== ''; }); })
    .map(function (row) {
      var obj = {};
      headers.forEach(function (h, i) { obj[h] = row[i]; });
      return obj;
    });
}

// Positional read (used for Receipt / PAYMENT where header names repeat, e.g. "Ledger_Name"
// appears twice — once for the Credit ledger block, once for the Debit ledger block).
function sheetToRows_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) return [];
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  return data.slice(1).filter(function (row) { return row.some(function (c) { return c !== ''; }); });
}

function fmtTimestamp_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd-MMM-yyyy HH:mm:ss');
  return (v === undefined || v === null) ? '' : v;
}
function fmtDateOnly_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd-MMM-yyyy');
  return (v === undefined || v === null) ? '' : v;
}
function fmtValue_(v) { return (v === undefined || v === null) ? '' : v; }
function numOrZero_(v) {
  if (v === '' || v === null || v === undefined) return 0;
  var n = parseFloat(String(v).replace(/[₹,\s]/g, ''));
  return isNaN(n) ? 0 : n;
}
function isYes_(v) { return String(v || '').trim().toUpperCase() === 'YES'; }

// Tolerant header lookup: exact match first, then case/whitespace-insensitive fallback.
function pick_(r, names) {
  for (var i = 0; i < names.length; i++) {
    if (Object.prototype.hasOwnProperty.call(r, names[i])) return r[names[i]];
  }
  var keys = Object.keys(r);
  for (var i = 0; i < names.length; i++) {
    var target = names[i].replace(/\s+/g, ' ').trim().toUpperCase();
    for (var j = 0; j < keys.length; j++) {
      if (keys[j].replace(/\s+/g, ' ').trim().toUpperCase() === target) return r[keys[j]];
    }
  }
  return '';
}

/* ============================= ROW MAPPERS ============================= */
// Simple login only (no per-page permission matrix) — every logged-in user gets every
// page. Per explicit user instruction: "we dont need any permission only id n password
// in col b and c" — read POSITIONALLY: column A = Name (optional/free text), column B
// = ID, column C = Password. No other columns are required or read.
function mapUserRow_(row) {
  return {
    name: fmtValue_(row[0]) || '', id: String(row[1] || '').trim() /* column B */,
    password: String(row[2] || '').trim() /* column C */,
    role: 'Team Member'
  };
}

function mapExpense_(rows) {
  return rows.map(function (r) {
    return {
      timestamp: fmtTimestamp_(r['TIMESTAMP']), date: fmtDateOnly_(r['DATE']),
      voucherNumber: fmtValue_(r['VOUCHER NUMBER']), partyName: r['PARTY NAME'] || '',
      group: r['Group'] || '', subGroup: r['Sub_Group'] || '',
      designNumber: fmtValue_(r['DESIGN NUMBER']), itemName: fmtValue_(r['ITEM NAME']),
      qty: fmtValue_(r['QTY']), rate: fmtValue_(r['RATE']), amount: numOrZero_(r['AMOUNT']),
      type: r['TYPE'] || ''
    };
  });
}

function mapPayables_(rows) {
  return rows.map(function (r) {
    return {
      timestamp: fmtTimestamp_(r['TIMESTAMP']), billDate: fmtDateOnly_(r['Bill_Date']),
      billRefNo: fmtValue_(r['Bill_Ref_No']), partyName: r['Party_Name'] || '',
      partyGroup: r['Party_Group'] || '', subGroup: r['Sub_Group'] || '', mainGroup: r['Main_Group'] || '',
      salesPerson: fmtValue_(pick_(r, ['Sales Person'])), phoneNo: fmtValue_(pick_(r, ['Phone No.', 'Phone No'])),
      paymentTerms: fmtValue_(r['Payment Terms']), closingBalance: numOrZero_(r['Closing_Balance']),
      dueDate: fmtDateOnly_(r['Due_Date']), overdueDays: numOrZero_(r['Overdue_Days'])
    };
  });
}

// RECEIVABLES is read POSITIONALLY (by column letter), not by header text, per explicit
// user instruction: "total receivables will be pick from sheet RECEIVABLES and col K".
// Column K (11th column, 0-based index 10) is always Pending Amount, regardless of what
// text is actually typed into that header cell — this makes the figure immune to the
// header-renaming issue that caused problems previously.
var RECEIVABLES_COLS_POSITIONAL = [
  'timestamp', 'billDate', 'billRefNo', 'partyName', 'partyGroup', 'subGroup', 'mainGroup',
  'salesPerson', 'phoneNo', 'paymentTerms', 'pendingAmount' /* column K */, 'dueDate', 'overdueDays'
];
function mapReceivablesRows_(rows) {
  return rows.map(function (row) {
    return {
      timestamp: fmtTimestamp_(row[0]), billDate: fmtDateOnly_(row[1]), billRefNo: fmtValue_(row[2]),
      partyName: fmtValue_(row[3]) || '', partyGroup: fmtValue_(row[4]) || '', subGroup: fmtValue_(row[5]) || '',
      mainGroup: fmtValue_(row[6]) || '', salesPerson: fmtValue_(row[7]), phoneNo: fmtValue_(row[8]),
      paymentTerms: fmtValue_(row[9]), pendingAmount: numOrZero_(row[10]) /* column K */,
      dueDate: fmtDateOnly_(row[11]), overdueDays: numOrZero_(row[12])
    };
  });
}

// Finds the first column index whose header text CONTAINS any of the given substrings
// (case-insensitive). Returns -1 if none match. Used for SALES below, where the user's
// original "column M / column N" instruction turned out to be off by one because
// columns I and J are HIDDEN in the actual sheet (confirmed from a screenshot) — hidden
// columns still count for array-index purposes, silently shifting every fixed column
// letter to the right. Searching by header TEXT instead of a hardcoded index makes this
// immune to hidden/inserted columns going forward.
function findColIndexByHeaderContains_(headerRow, substrings) {
  for (var i = 0; i < headerRow.length; i++) {
    var h = String(headerRow[i] || '').toUpperCase();
    for (var j = 0; j < substrings.length; j++) {
      if (h.indexOf(substrings[j]) !== -1) return i;
    }
  }
  return -1;
}

function getHeaderRow_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) return [];
  var lastCol = sh.getLastColumn();
  if (lastCol === 0) return [];
  return sh.getRange(1, 1, 1, lastCol).getValues()[0];
}

// SALES tab reader. Column A = sale date (Timestamp), used by the "Sales vs Expenses
// Trend" chart. The amount ("TOTAL PRICE") and category columns are located by
// SEARCHING the actual header row for matching text, NOT by a hardcoded column letter —
// this was originally column M/N by count, but the real sheet has 2 hidden columns
// (I, J), which silently shifted TOTAL PRICE to column N and CATEGORY to column O.
// Falls back to the original M/N indices only if no header match is found at all.
function mapSalesRows_(rows, headerRow) {
  headerRow = headerRow || [];
  var amountIdx = findColIndexByHeaderContains_(headerRow, ['TOTAL PRICE', 'TOTAL AMOUNT', 'SALE AMOUNT', 'AMOUNT']);
  if (amountIdx === -1) amountIdx = 12; // fallback: column M
  var categoryIdx = findColIndexByHeaderContains_(headerRow, ['CATEG']);
  if (categoryIdx === -1) categoryIdx = 13; // fallback: column N
  return rows.map(function (row) {
    return {
      date: fmtDateOnly_(row[0]) /* column A */,
      amount: numOrZero_(row[amountIdx]),
      category: fmtValue_(row[categoryIdx])
    };
  });
}

// Expense reader used ONLY for the Dashboard's "Sales vs Expenses Trend" chart, per
// explicit user instruction: "EXPENSE KA SHEET... COL K MEIN AMOUNT HAI COL B MEIN DATE".
// Read positionally by column letter — column B (2nd column, 0-based index 1) = date,
// column K (11th column, 0-based index 10) = amount. This is separate from mapExpense_
// (used by the Expense Vouchers grid, header-based) so that grid's other columns
// (voucher no, item name, etc.) are unaffected by this change.
function mapExpenseTrendRows_(rows) {
  return rows.map(function (row) {
    return {
      date: fmtDateOnly_(row[1]) /* column B */,
      amount: numOrZero_(row[10]) /* column K */
    };
  });
}

// Positional mapper for Receipt / PAYMENT (18 columns, header names repeat so we can't
// key off header text reliably — read by column index instead).
function mapReceiptRows_(rows) {
  return rows.map(function (row) {
    return {
      timestamp: fmtTimestamp_(row[0]), voucherNumber: fmtValue_(row[1]), date: fmtDateOnly_(row[2]),
      group: fmtValue_(row[3]), subGroup: fmtValue_(row[4]),
      creditLedgerName: fmtValue_(row[5]), creditLedgerAmount: numOrZero_(row[6]),
      billType: fmtValue_(row[7]), billName: fmtValue_(row[8]), billAmount: numOrZero_(row[9]),
      type: fmtValue_(row[10]),
      debitLedgerName: fmtValue_(row[11]), debitLedgerAmount: numOrZero_(row[12]),
      bankPartyName: fmtValue_(row[13]), transactionType: fmtValue_(row[14]),
      instNo: fmtValue_(row[15]), instDate: fmtDateOnly_(row[16]), bankName: fmtValue_(row[17])
    };
  });
}

var BALANCE_COLS = [
  'timestamp','name','alias','subgroup','group','mainGroup','guid','masterId','alterId',
  'billByBill','creditPeriod','creditLimit','state','country','pincode','email','emailCC',
  'contactPerson','mobile','openingDate','openingParticular','openingDebit','openingCredit',
  'openingBalance','voucherDate','voucherParticular','voucherType','voucherNo','voucherDebit',
  'voucherCredit','closingDate','closingParticular','closingDebit','closingCredit','closingBalance'
];

// Positional mapper for the Balance/Ledger source tab (35 columns, exact order given by user).
function mapBalanceRows_(rows) {
  return rows.map(function (row) {
    var o = {};
    BALANCE_COLS.forEach(function (key, i) {
      var v = row[i];
      if (key === 'timestamp') v = fmtTimestamp_(v);
      else if (key === 'openingDate' || key === 'voucherDate' || key === 'closingDate') v = fmtDateOnly_(v);
      else if (key === 'openingDebit' || key === 'openingCredit' || key === 'openingBalance' ||
               key === 'voucherDebit' || key === 'voucherCredit' ||
               key === 'closingDebit' || key === 'closingCredit' || key === 'closingBalance') v = numOrZero_(v);
      else v = fmtValue_(v);
      o[key] = v;
    });
    return o;
  });
}

// Flattens the Balance tab into one row per actual voucher line (across all parties),
// used by the Finance 360 dashboard to derive Sales / Purchase / Credit Note figures
// (there is no dedicated Sales/Purchase register sheet, so we approximate from the
// party ledger's voucherType field — see README "Assumptions" section).
function getBalanceVouchersFromRows_(rows) {
  var out = [];
  rows.forEach(function (r) {
    if (!r.voucherDate && !r.voucherParticular && !r.voucherNo) return;
    out.push({
      partyName: r.name, group: r.group, subgroup: r.subgroup, mainGroup: r.mainGroup,
      date: r.voucherDate, particular: r.voucherParticular, voucherType: r.voucherType,
      voucherNo: r.voucherNo, debit: r.voucherDebit, credit: r.voucherCredit
    });
  });
  return out;
}

/* ============================= LOGIN / BOOTSTRAP =============================
 * Simple login only (no per-page permission matrix): getLoginData() is called once on
 * page load to populate the login screen, and getBootstrapData() is called once after
 * a successful login (and again only when the user clicks "Sync with Tally") to load
 * every tab in a single batch. There are NO per-navigation-click server round-trips
 * anymore, which is the main speed fix — previously every sidebar click re-read the
 * LOGIN PAGE sheet just to re-check permissions.
 */
function getLoginData() {
  // Read positionally (column B = ID, column C = Password) — see mapUserRow_ above.
  // sheetToRows_ already skips the header row, matching the old sheetToObjects_ behavior.
  var usersRaw = sheetToRows_(SHEETS.login);
  return { users: usersRaw.map(mapUserRow_).filter(function (u) { return u.id; }) };
}

// Short-lived cache to speed up repeat loads (this is the main fix for "data taking too
// long to load"). getBootstrapData(true) (used by the "Sync with Tally" button) always
// bypasses the cache and re-reads the live sheet. A plain call (used right after login)
// serves a cached copy if one was written in the last CACHE_TTL_SECONDS, which makes a
// second user logging in — or the same user reloading the page — nearly instant instead
// of re-reading every tab from scratch. If the payload is too large for CacheService's
// 100KB-per-key limit, caching is silently skipped (no error, just no speed-up).
var BOOTSTRAP_CACHE_KEY = 'tally360_bootstrap_v1';
var CACHE_TTL_SECONDS = 45;

function getBootstrapData(forceRefresh) {
  var cache = CacheService.getScriptCache();
  if (!forceRefresh) {
    try {
      var cached = cache.get(BOOTSTRAP_CACHE_KEY);
      if (cached) return JSON.parse(cached);
    } catch (e) { /* ignore cache read errors, fall through to a live read */ }
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Read the Balance tab's rows ONCE and reuse for both the ledger party list and the
  // sales/purchase voucher extraction (previously read twice — this halves that cost).
  var balanceRows = mapBalanceRows_(sheetToRows_(SHEETS.balance));

  var result = {
    expense:     mapExpense_(sheetToObjects_(SHEETS.expense)),
    payables:    mapPayables_(sheetToObjects_(SHEETS.payables)),
    receivables: mapReceivablesRows_(sheetToRows_(SHEETS.receivables)),
    receipt:     mapReceiptRows_(sheetToRows_(SHEETS.receipt)),
    payment:     mapReceiptRows_(sheetToRows_(SHEETS.payment)),
    salesRows:   mapSalesRows_(sheetToRows_(SHEETS.sales), getHeaderRow_(SHEETS.sales)),
    expenseTrendRows: mapExpenseTrendRows_(sheetToRows_(SHEETS.expense)),
    balanceParties:  getLedgerPartyListFromRows_(balanceRows),
    balanceVouchers: getBalanceVouchersFromRows_(balanceRows),
    missingSheets: [],
    diagnostics: getDiagnostics_()
  };

  var have = {};
  ss.getSheets().forEach(function (s) { have[s.getName().trim().toUpperCase()] = true; });
  Object.keys(SHEETS).forEach(function (k) {
    if (!have[SHEETS[k].toUpperCase()]) result.missingSheets.push(SHEETS[k]);
  });

  try { cache.put(BOOTSTRAP_CACHE_KEY, JSON.stringify(result), CACHE_TTL_SECONDS); } catch (e) { /* payload too large for cache; skip silently, no functional impact */ }

  return result;
}

/* ============================= DIAGNOSTICS =============================
 * Explains WHY a tab returned no data, instead of silently returning empty
 * arrays. Checked per-tab: does the sheet exist (exact name match)? How many
 * data rows does it have? For the object-keyed tabs (where we read columns
 * by header name), are any of the expected header names actually missing?
 * This is surfaced in the UI as a "Data Diagnostics" banner whenever the
 * dashboard totals come back all-zero, so a sheet/header mismatch is
 * immediately obvious without needing another round of screenshots.
 */
// NOTE: LOGIN PAGE, RECEIVABLES and SALES are intentionally NOT in EXPECTED_HEADERS —
// all three are read POSITIONALLY by column letter (see mapUserRow_/mapReceivablesRows_/
// mapSalesRows_ above), so their header row TEXT doesn't matter and is not checked here.
// They ARE checked for column COUNT below (EXPECTED_MIN_COLS) where relevant, since a
// missing/inserted column would shift every field.
var EXPECTED_HEADERS = {
  'EXPENSE':     ['TIMESTAMP', 'DATE', 'VOUCHER NUMBER', 'PARTY NAME', 'Group', 'Sub_Group', 'AMOUNT'],
  'PAYABLES':    ['TIMESTAMP', 'Bill_Date', 'Bill_Ref_No', 'Party_Name', 'Closing_Balance', 'Due_Date', 'Overdue_Days']
};
var EXPECTED_MIN_COLS = { 'Receipt': 18, 'PAYMENT': 18, 'Balance': 35, 'RECEIVABLES': 13, 'SALES': 14, 'EXPENSE': 11, 'LOGIN PAGE': 3 };

function headerMatches_(actualHeaders, expected) {
  var norm = actualHeaders.map(function (h) { return String(h).replace(/\s+/g, ' ').trim().toUpperCase(); });
  var target = expected.replace(/\s+/g, ' ').trim().toUpperCase();
  return norm.indexOf(target) !== -1;
}

function getDiagnostics_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var out = {};
  Object.keys(SHEETS).forEach(function (key) {
    var tabName = SHEETS[key];
    var sh = ss.getSheetByName(tabName);
    if (!sh) {
      out[tabName] = { exists: false, dataRowCount: 0, columnCount: 0, missingHeaders: [] };
      return;
    }
    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    var dataRowCount = Math.max(0, lastRow - 1);
    var headerRow = lastCol > 0 ? sh.getRange(1, 1, 1, lastCol).getValues()[0] : [];
    var missingHeaders = [];
    if (EXPECTED_HEADERS[tabName]) {
      EXPECTED_HEADERS[tabName].forEach(function (h) {
        if (!headerMatches_(headerRow, h)) missingHeaders.push(h);
      });
    }
    var expectedMinCols = EXPECTED_MIN_COLS[tabName];
    out[tabName] = {
      exists: true,
      dataRowCount: dataRowCount,
      columnCount: lastCol,
      missingHeaders: missingHeaders,
      columnCountOk: expectedMinCols ? lastCol >= expectedMinCols : null,
      expectedMinCols: expectedMinCols || null
    };
  });
  return out;
}

/* ============================= LEDGER (Balance tab) ============================= */

// Lightweight party directory for the Ledger picker (name + group + mobile + running closing).
function getLedgerPartyListFromRows_(rows) {
  var byName = {};
  rows.forEach(function (r) {
    if (!r.name) return;
    if (!byName[r.name]) {
      byName[r.name] = {
        name: r.name, subgroup: r.subgroup, group: r.group, mobile: r.mobile,
        state: r.state, closingBalance: 0, hasClosing: false
      };
    }
    if (r.closingParticular) { byName[r.name].closingBalance = r.closingDebit - r.closingCredit; byName[r.name].hasClosing = true; }
  });
  return Object.keys(byName).sort().map(function (n) { return byName[n]; });
}

/**
 * Builds the full statement for one party from the Balance tab.
 * Returns { header:{...party info...}, opening:{date,particular,debit,credit,balance},
 *           entries:[{date,particular,vchType,vchNo,debit,credit,balance}],
 *           closing:{date,particular,debit,credit,balance} }
 */
function getLedgerForParty(name) {
  var rows = mapBalanceRows_(sheetToRows_(SHEETS.balance)).filter(function (r) { return r.name === name; });
  if (!rows.length) return null;

  var first = rows[0];
  var header = {
    name: first.name, alias: first.alias, subgroup: first.subgroup, group: first.group,
    mainGroup: first.mainGroup, state: first.state, country: first.country, pincode: first.pincode,
    email: first.email, emailCC: first.emailCC, contactPerson: first.contactPerson, mobile: first.mobile,
    creditPeriod: first.creditPeriod, creditLimit: first.creditLimit, billByBill: first.billByBill,
    address: first.guid /* GUID column often holds the registered address text in this export */
  };

  // Opening: first row that actually carries an opening particular.
  var openingRow = rows.find(function (r) { return r.openingParticular; }) || first;
  var opening = {
    date: openingRow.openingDate, particular: openingRow.openingParticular || 'Opening Balance',
    debit: openingRow.openingDebit, credit: openingRow.openingCredit, balance: openingRow.openingBalance
  };

  var running = opening.debit - opening.credit;
  var entries = [];
  rows.forEach(function (r) {
    if (!r.voucherDate && !r.voucherParticular && !r.voucherNo) return;
    running += (r.voucherDebit - r.voucherCredit);
    entries.push({
      date: r.voucherDate, particular: r.voucherParticular, vchType: r.voucherType, vchNo: r.voucherNo,
      debit: r.voucherDebit, credit: r.voucherCredit, balance: running
    });
  });

  var closingRow = rows.slice().reverse().find(function (r) { return r.closingParticular; }) || rows[rows.length - 1];
  var closing = {
    date: closingRow.closingDate, particular: closingRow.closingParticular || 'Closing Balance',
    debit: closingRow.closingDebit, credit: closingRow.closingCredit,
    balance: (closingRow.closingDebit || closingRow.closingCredit) ? (closingRow.closingDebit - closingRow.closingCredit) : running
  };

  return { header: header, opening: opening, entries: entries, closing: closing };
}


/* =============================================================================
 * ⭐ RUN THIS FIRST — direct diagnostic, no deployment/browser needed ⭐
 * =============================================================================
 * HOW TO USE:
 *   1. Open this script in the Apps Script editor (script.google.com project
 *      bound to your Google Sheet).
 *   2. At the top toolbar, in the function dropdown (next to Debug/Run icons),
 *      select "runDiagnosticsNow".
 *   3. Click "Run" (▶).
 *   4. First time only: it will ask you to authorize — click through and allow.
 *   5. Click "Execution log" (or View > Logs, or Ctrl+Enter) to see the output.
 *
 * This talks DIRECTLY to your Google Sheet — it does NOT go through the web
 * app, the /exec URL, or any deployment. So it is 100% unaffected by "did I
 * deploy the latest version" issues. Whatever this prints IS the truth about
 * your sheet right now.
 *
 * It will tell you, for every required tab:
 *   - The EXACT tab name it's looking for, and whether that tab exists
 *   - If it exists: how many data rows, how many columns, and the first row
 *     of actual header text (copy-paste this back if headers don't match)
 *   - For EXPENSE/PAYABLES/RECEIVABLES: whether every expected column header
 *     was found
 *   - For Receipt/PAYMENT/Balance (read positionally): the actual column
 *     count vs the 18/18/35 expected
 *   - A live sample: the first data row's key totals (e.g. first Payables
 *     Closing_Balance, first Receivables Pending Amount) so you can see with
 *     your own eyes whether real numbers are being read out of the sheet.
 */
function runDiagnosticsNow() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log('================================================================');
  Logger.log('TALLY CRM — DIRECT SHEET DIAGNOSTIC');
  Logger.log('Bound spreadsheet: "%s"', ss.getName());
  Logger.log('Sheet tabs actually present in this spreadsheet: %s',
    ss.getSheets().map(function (s) { return '"' + s.getName() + '"'; }).join(', '));
  Logger.log('================================================================');

  Object.keys(SHEETS).forEach(function (key) {
    var tabName = SHEETS[key];
    var sh = ss.getSheetByName(tabName);
    Logger.log('');
    Logger.log('--- Tab expected: "%s" ---', tabName);
    if (!sh) {
      Logger.log('❌ NOT FOUND. This exact name does not exist as a tab in this spreadsheet.');
      Logger.log('   FIX: rename your actual tab to exactly "%s" (check for extra spaces / different case / typos).', tabName);
      return;
    }
    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    var dataRows = Math.max(0, lastRow - 1);
    Logger.log('✅ Found. Rows (incl. header): %s | Data rows: %s | Columns: %s', lastRow, dataRows, lastCol);
    if (lastCol === 0 || lastRow === 0) {
      Logger.log('❌ Tab is completely empty (no header row even). Nothing can be read from it.');
      return;
    }
    var headerRow = sh.getRange(1, 1, 1, lastCol).getValues()[0];
    Logger.log('   Header row (row 1) actual text: %s', JSON.stringify(headerRow));

    if (EXPECTED_HEADERS[tabName]) {
      var missing = EXPECTED_HEADERS[tabName].filter(function (h) { return !headerMatches_(headerRow, h); });
      if (missing.length) {
        Logger.log('❌ MISSING expected header(s): %s', missing.join(', '));
        Logger.log('   FIX: rename the matching column(s) in row 1 to exactly this text (spelling/spacing/underscore matters).');
      } else {
        Logger.log('✅ All expected headers found for this tab.');
      }
    }
    if (EXPECTED_MIN_COLS[tabName]) {
      var expectedMin = EXPECTED_MIN_COLS[tabName];
      if (lastCol < expectedMin) {
        Logger.log('❌ This tab is read by COLUMN POSITION (not header name). It has %s columns but %s are expected.', lastCol, expectedMin);
        Logger.log('   FIX: this usually means a column was deleted/inserted, shifting every field. Compare against the exact column order documented at the top of Code.gs.');
      } else {
        Logger.log('✅ Column count OK for positional read (%s columns, %s+ expected).', lastCol, expectedMin);
      }
    }
    if (dataRows === 0) {
      Logger.log('❌ Tab exists and headers look fine, but there are 0 DATA ROWS below the header. That alone would make every total show ₹0.');
    }
  });

  Logger.log('');
  Logger.log('================================================================');
  Logger.log('LIVE SAMPLE — actual values read from your PAYABLES / RECEIVABLES tabs');
  Logger.log('================================================================');
  try {
    var payRows = mapPayables_(sheetToObjects_(SHEETS.payables));
    Logger.log('PAYABLES: mapped %s row(s).', payRows.length);
    if (payRows.length) {
      Logger.log('First Payables row -> partyName="%s", closingBalance=%s, dueDate="%s", overdueDays=%s',
        payRows[0].partyName, payRows[0].closingBalance, payRows[0].dueDate, payRows[0].overdueDays);
      var totalPay = payRows.reduce(function (s, r) { return s + (Number(r.closingBalance) || 0); }, 0);
      Logger.log('SUM of closingBalance across all Payables rows = %s  (this is your "Outstanding Payables" KPI card)', totalPay);
    } else {
      Logger.log('⚠ No Payables rows were mapped — see the PAYABLES section above for why.');
    }
  } catch (e) {
    Logger.log('❌ ERROR while reading PAYABLES: %s', e.message);
  }

  try {
    var recvRows = mapReceivablesRows_(sheetToRows_(SHEETS.receivables));
    Logger.log('RECEIVABLES: mapped %s row(s) (read positionally — column K = Pending Amount).', recvRows.length);
    if (recvRows.length) {
      Logger.log('First Receivables row -> partyName="%s", pendingAmount(col K)=%s, dueDate="%s", overdueDays=%s',
        recvRows[0].partyName, recvRows[0].pendingAmount, recvRows[0].dueDate, recvRows[0].overdueDays);
      var totalRecv = recvRows.reduce(function (s, r) { return s + (Number(r.pendingAmount) || 0); }, 0);
      Logger.log('SUM of column K (pendingAmount) across all Receivables rows = %s  (this is your "Total Receivables" KPI card)', totalRecv);
    } else {
      Logger.log('⚠ No Receivables rows were mapped — see the RECEIVABLES section above for why.');
    }
  } catch (e) {
    Logger.log('❌ ERROR while reading RECEIVABLES: %s', e.message);
  }

  try {
    var salesHeaderRow = getHeaderRow_(SHEETS.sales);
    var salesAmountIdx = findColIndexByHeaderContains_(salesHeaderRow, ['TOTAL PRICE', 'TOTAL AMOUNT', 'SALE AMOUNT', 'AMOUNT']);
    var salesCategoryIdx = findColIndexByHeaderContains_(salesHeaderRow, ['CATEG']);
    Logger.log('SALES header-text search -> amount column found at index %s (%s), category column found at index %s (%s)',
      salesAmountIdx, salesAmountIdx === -1 ? 'NOT FOUND, falling back to column M' : 'column letter ' + String.fromCharCode(65 + salesAmountIdx),
      salesCategoryIdx, salesCategoryIdx === -1 ? 'NOT FOUND, falling back to column N' : 'column letter ' + String.fromCharCode(65 + salesCategoryIdx));
    var salesRows = mapSalesRows_(sheetToRows_(SHEETS.sales), salesHeaderRow);
    Logger.log('SALES: mapped %s row(s).', salesRows.length);
    if (salesRows.length) {
      Logger.log('First Sales row -> amount=%s, category="%s"', salesRows[0].amount, salesRows[0].category);
      var totalSales = salesRows.reduce(function (s, r) { return s + (Number(r.amount) || 0); }, 0);
      Logger.log('SUM of amount across all Sales rows = %s  (this is your Dashboard "Total Sales" KPI card)', totalSales);
    } else {
      Logger.log('⚠ No Sales rows were mapped — see the SALES section above for why.');
    }
  } catch (e) {
    Logger.log('❌ ERROR while reading SALES: %s', e.message);
  }

  Logger.log('');
  Logger.log('================================================================');
  Logger.log('DONE. Copy everything above (or a screenshot of this log) back to Kiro.');
  Logger.log('================================================================');
}
