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
  sales:       'SALES',
  // Append-only follow-up history log — auto-created (see ensureFollowUpLogSheet_)
  // the first time a follow-up is saved. One row per Mark/Edit Follow Up save, per
  // explicit user instruction ("IS THERE ANY WAY I CAN SAVE ALL PREVIOUS FOLLOW UP
  // REMARKS ALSO AND CAN SEE ALSO WHILE FOLLOW UP"). Kept separate from the SALES
  // sheet's own DATE/REMARKS/PROMISED AMOUNT columns (which still get the LATEST
  // values written for backward-compat / at-a-glance visibility directly on SALES),
  // so no previous entry is ever overwritten or lost.
  followUpLog: 'FOLLOWUP_LOG'
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

/* ============================= MAP BOUNDARY FALLBACK =============================
 * Browser CORS/firewall rules can block direct GeoJSON downloads inside the Apps
 * Script iframe. This allow-listed server proxy is a reliable fallback. Geometry
 * is compacted before returning so even Uttar Pradesh stays below the practical
 * google.script.run response limit while preserving every district boundary.
 */
var DISTRICT_MAP_FILES_ = {
  'Andaman & Nicobar Island':'andaman-and-nicobar-islands','Andhra Pradesh':'andhra-pradesh',
  'Arunanchal Pradesh':'arunachal-pradesh','Assam':'assam','Bihar':'bihar','Chandigarh':'chandigarh',
  'Chhattisgarh':'chhattisgarh','Dadara & Nagar Havelli':'dnh-and-dd','Daman & Diu':'dnh-and-dd',
  'Dadra & Nagar Haveli and Daman & Diu':'dnh-and-dd','NCT of Delhi':'delhi','Goa':'goa',
  'Gujarat':'gujarat','Haryana':'haryana','Himachal Pradesh':'himachal-pradesh',
  'Jammu & Kashmir':'jammu-and-kashmir','Ladakh':'ladakh','Jharkhand':'jharkhand',
  'Karnataka':'karnataka','Kerala':'kerala','Lakshadweep':'lakshadweep','Madhya Pradesh':'madhya-pradesh',
  'Maharashtra':'maharashtra','Manipur':'manipur','Meghalaya':'meghalaya','Mizoram':'mizoram',
  'Nagaland':'nagaland','Odisha':'odisha','Puducherry':'puducherry','Punjab':'punjab',
  'Rajasthan':'rajasthan','Sikkim':'sikkim','Tamil Nadu':'tamil-nadu','Telangana':'telangana',
  'Tripura':'tripura','Uttar Pradesh':'uttar-pradesh','Uttarakhand':'uttarakhand','West Bengal':'west-bengal'
};
function compactMapRing_(ring, maxPoints) {
  if (!Array.isArray(ring) || !ring.length) return [];
  var count = Math.min(ring.length, maxPoints);
  var out = [];
  for (var i = 0; i < count; i++) {
    var sourceIndex = count === ring.length ? i : Math.round(i * (ring.length - 1) / (count - 1));
    var point = ring[sourceIndex] || [0, 0];
    out.push([Math.round(Number(point[0]) * 10000) / 10000, Math.round(Number(point[1]) * 10000) / 10000]);
  }
  return out;
}
function compactMapGeometry_(geometry) {
  if (!geometry) return null;
  if (geometry.type === 'Polygon') {
    return { type: 'Polygon', coordinates: geometry.coordinates.map(function (ring) { return compactMapRing_(ring, 65); }) };
  }
  if (geometry.type === 'MultiPolygon') {
    return { type: 'MultiPolygon', coordinates: geometry.coordinates.map(function (poly) {
      return poly.map(function (ring) { return compactMapRing_(ring, 65); });
    }) };
  }
  return null;
}
function getDistrictGeoJson(stateName) {
  var file = DISTRICT_MAP_FILES_[String(stateName || '').trim()];
  if (!file) throw new Error('District boundary file is not available for ' + stateName);
  var path = 'geojson/states/' + file + '.geojson';
  var urls = [
    'https://cdn.jsdelivr.net/gh/udit-001/india-maps-data@2884453/' + path,
    'https://raw.githubusercontent.com/udit-001/india-maps-data/2884453/' + path
  ];
  var lastError = 'Unable to fetch district boundaries';
  for (var i = 0; i < urls.length; i++) {
    try {
      var response = UrlFetchApp.fetch(urls[i], { muteHttpExceptions: true, followRedirects: true });
      if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
        lastError = 'HTTP ' + response.getResponseCode();
        continue;
      }
      var source = JSON.parse(response.getContentText());
      if (!source || !Array.isArray(source.features) || !source.features.length) throw new Error('Invalid GeoJSON');
      return {
        type: 'FeatureCollection',
        features: source.features.map(function (feature) {
          var props = feature.properties || {};
          return { type: 'Feature', properties: { district: props.district || '', st_nm: props.st_nm || stateName }, geometry: compactMapGeometry_(feature.geometry) };
        }).filter(function (feature) { return feature.geometry; })
      };
    } catch (err) { lastError = err && err.message ? err.message : String(err); }
  }
  throw new Error(lastError);
}

/* ============================= GENERIC SHEET READ ============================= */
// Detects a data row that is ACTUALLY a duplicate/repeated header row (e.g. a frozen
// label row re-pasted into the data range, or an accidental second header row) —
// per explicit user report with a screenshot: Receipt List's very first data row was
// showing the column header text itself ("Timestamp", "Voucher_Number", "Ledger_Name"
// etc) instead of real values. Compares each cell against that column's own header
// text (ignoring case/spaces/underscores) and requires BOTH: at least 3 matching
// cells, AND those matches covering most (60%+) of the non-blank cells in the row —
// this is deliberately strict so a genuine data row that happens to repeat one
// header-like word (e.g. a party literally named "Date") is never mistaken for a
// duplicate header and silently dropped.
function looksLikeHeaderRow_(row, headers) {
  if (!headers || !headers.length) return false;
  var nonEmpty = 0, matches = 0;
  var n = Math.min(headers.length, row.length);
  for (var i = 0; i < n; i++) {
    var h = String(headers[i] == null ? '' : headers[i]).replace(/[\s_]+/g, '').trim().toUpperCase();
    if (!h) continue;
    var v = String(row[i] == null ? '' : row[i]).replace(/[\s_]+/g, '').trim().toUpperCase();
    if (!v) continue;
    nonEmpty++;
    if (v === h) matches++;
  }
  return nonEmpty > 0 && matches >= 3 && (matches / nonEmpty) >= 0.6;
}

function sheetToObjects_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) return [];
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  var headerRow = data[0];
  var headers = headerRow.map(function (h) { return String(h).replace(/\s+/g, ' ').trim(); });
  return data.slice(1)
    .filter(function (row) { return row.some(function (c) { return c !== ''; }); })
    .filter(function (row) { return !looksLikeHeaderRow_(row, headerRow); })
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
  var headerRow = data[0];
  return data.slice(1)
    .filter(function (row) { return row.some(function (c) { return c !== ''; }); })
    .filter(function (row) { return !looksLikeHeaderRow_(row, headerRow); });
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

// Same header-text search as above, but only considers columns AFTER `afterIdx` —
// used for the SALES sheet's follow-up DATE/REMARKS/PROMISED AMOUNT columns (which
// sit near the far right of the sheet, per the user's screenshot), so a generic
// "DATE" search doesn't accidentally match the sheet's own leading Sale Date column
// (column A) instead of the follow-up-specific one further right.
function findColIndexByHeaderContainsAfter_(headerRow, substrings, afterIdx) {
  for (var i = (afterIdx == null ? 0 : afterIdx) + 1; i < headerRow.length; i++) {
    var h = String(headerRow[i] || '').toUpperCase();
    for (var j = 0; j < substrings.length; j++) {
      if (h.indexOf(substrings[j]) !== -1) return i;
    }
  }
  return -1;
}

// Finds geographic text columns without accidentally choosing DISTRICT CODE,
// CITY ID, etc. Exact business headers win; a conservative contains fallback is
// used only when the header is not a code/number field.
function findLocationColIndex_(headerRow, exactNames, fallbackTokens) {
  var exact = {};
  exactNames.forEach(function (name) { exact[String(name).toUpperCase()] = true; });
  var normalized = headerRow.map(function (value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' ');
  });
  for (var i = 0; i < normalized.length; i++) if (exact[normalized[i]]) return i;
  for (var j = 0; j < normalized.length; j++) {
    var h = normalized[j];
    if (/\b(CODE|ID|NUMBER|NO)\b/.test(h)) continue;
    for (var k = 0; k < fallbackTokens.length; k++) if (h.indexOf(fallbackTokens[k]) !== -1) return j;
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

  // Customer-list fields are found from tolerant header aliases because SALES exports
  // can reorder columns or contain hidden columns. The first matching header wins.
  var invoiceNoIdx = findColIndexByHeaderContains_(headerRow, ['INVOICE NO', 'INVOICE NUMBER', 'VOUCHER NO', 'BILL NO']);
  var invoiceToIdx = findColIndexByHeaderContains_(headerRow, ['INVOICE TO', 'CUSTOMER NAME', 'PARTY NAME', 'BUYER NAME']);
  var addressIdx = findColIndexByHeaderContains_(headerRow, ['BILLING ADDRESS', 'CUSTOMER ADDRESS', 'ADDRESS']);
  var stateIdx = findColIndexByHeaderContains_(headerRow, ['STATE']);
  // Keep CITY and DISTRICT separate for the map. District is the only field that
  // can be matched honestly to an administrative boundary; CITY/PLACE remains
  // the customer-facing label. If a sheet has only DISTRICT, reuse it as city so
  // the existing city table still works without requiring a sheet migration.
  var districtIdx = findLocationColIndex_(headerRow,
    ['DISTRICT', 'DISTRICT NAME', 'CUSTOMER DISTRICT', 'BILLING DISTRICT'], ['DISTRICT']);
  var cityIdx = findLocationColIndex_(headerRow,
    ['CITY', 'CITY NAME', 'CUSTOMER CITY', 'BILLING CITY', 'PLACE'], ['CITY', 'PLACE']);
  if (cityIdx === -1) cityIdx = districtIdx;
  var gstIdx = findColIndexByHeaderContains_(headerRow, ['GST NO', 'GSTIN', 'GST NUMBER']);
  var contactIdx = findColIndexByHeaderContains_(headerRow, ['CONTACT PERSON NAME', 'CONTACT PERSON']);
  var phoneIdx = findColIndexByHeaderContains_(headerRow, ['PHONE', 'MOBILE', 'CONTACT NO']);
  var emailIdx = findColIndexByHeaderContains_(headerRow, ['EMAIL', 'E-MAIL']);
  // Used by the Sales Report page (grouped by unique Invoice No, per-line descriptions
  // combined for a shared invoice). Same tolerant header-text search as the other
  // customer-list fields above, so hidden/reordered columns don't break it.
  var descriptionIdx = findColIndexByHeaderContains_(headerRow, ['DESCRIPTION', 'PARTICULAR', 'ITEM DESCRIPTION', 'ITEM NAME', 'PRODUCT']);

  // GST breakdown for the Sales Report's "Amount (Excl. GST)" column, per explicit
  // user request ("show me with without gst amount as well"). There is no fixed
  // column for this in the documented SALES layout, so — same tolerant header-text
  // search used for every other SALES field above — we look for whichever of these
  // a given sheet actually has, in priority order:
  //   1) an explicit taxable-value column (already excl. GST, use directly)
  //   2) an explicit GST amount column (Total Price - GST amount = excl. GST)
  //   3) a GST rate/% column (back-calculate: Total Price / (1 + rate/100))
  // If NONE of these exist, amountExclGst is left as null (not a guessed value) —
  // the Sales Report shows "—" for that row rather than a fabricated number.
  var taxableIdx = findColIndexByHeaderContains_(headerRow, ['TAXABLE VALUE', 'TAXABLE AMOUNT', 'TAXABLE']);
  var gstAmountIdx = findColIndexByHeaderContains_(headerRow, ['GST AMOUNT', 'TAX AMOUNT', 'TOTAL GST', 'GST VALUE']);
  var gstRateIdx = findColIndexByHeaderContains_(headerRow, ['GST RATE', 'GST %', 'GST PERCENT', 'TAX RATE']);

  return rows.map(function (row) {
    var totalAmount = numOrZero_(row[amountIdx]);
    var amountExclGst = null;
    if (taxableIdx !== -1) {
      amountExclGst = numOrZero_(row[taxableIdx]);
    } else if (gstAmountIdx !== -1) {
      amountExclGst = totalAmount - numOrZero_(row[gstAmountIdx]);
    } else if (gstRateIdx !== -1) {
      var rate = numOrZero_(row[gstRateIdx]);
      amountExclGst = rate > 0 ? totalAmount / (1 + rate / 100) : totalAmount;
    }
    if (amountExclGst !== null) amountExclGst = Math.round(amountExclGst * 100) / 100;
    return {
      date: fmtDateOnly_(row[0]) /* column A */,
      invoiceNo: invoiceNoIdx === -1 ? '' : fmtValue_(row[invoiceNoIdx]),
      invoiceTo: invoiceToIdx === -1 ? '' : fmtValue_(row[invoiceToIdx]),
      address: addressIdx === -1 ? '' : fmtValue_(row[addressIdx]),
      state: stateIdx === -1 ? '' : fmtValue_(row[stateIdx]),
      city: cityIdx === -1 ? '' : fmtValue_(row[cityIdx]),
      district: districtIdx === -1 ? '' : fmtValue_(row[districtIdx]),
      gstNo: gstIdx === -1 ? '' : fmtValue_(row[gstIdx]),
      contactPerson: contactIdx === -1 ? '' : fmtValue_(row[contactIdx]),
      phone: phoneIdx === -1 ? '' : fmtValue_(row[phoneIdx]),
      email: emailIdx === -1 ? '' : fmtValue_(row[emailIdx]),
      description: descriptionIdx === -1 ? '' : fmtValue_(row[descriptionIdx]),
      amount: totalAmount,
      amountExclGst: amountExclGst /* null when no GST column was found on the sheet */,
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

// Strips whitespace/underscores and uppercases — lets "Sub_Group", "Sub Group", and
// "SUBGROUP" all compare equal, and (critically) lets an EXACT match distinguish
// "DATE" from "INST_DATE"/"Inst Date" (which would otherwise collide under a plain
// substring search like the one findColIndexByHeaderContains_ uses for SALES).
function normalizeHeaderText_(h) { return String(h == null ? '' : h).replace(/[\s_]+/g, '').toUpperCase(); }
function findAllExactHeaderIndices_(headerRow, exactNormalized) {
  var out = [];
  for (var i = 0; i < headerRow.length; i++) { if (normalizeHeaderText_(headerRow[i]) === exactNormalized) out.push(i); }
  return out;
}
function findExactHeaderIndex_(headerRow, exactNormalized) {
  var all = findAllExactHeaderIndices_(headerRow, exactNormalized);
  return all.length ? all[0] : -1;
}

// Detects which of the first TWO rows of a Receipt/PAYMENT-style sheet is the REAL
// field-name header ("Timestamp"/"Ledger_Name"/"Ledger_Amount"/etc) versus a merged
// SECTION-TITLE row (e.g. "CreditLedgers"/"DebitLedgers" spanning several columns,
// confirmed present in the user's screenshot of the actual PAYMENT sheet). Reading
// the section-title row as "the header" (the old behavior) meant the REAL field-name
// row directly underneath it got treated as the first DATA row — a row of literal
// header text ("Timestamp", "Ledger_Name", ...) instead of real values — and every
// genuine data row after it was correspondingly misaligned. Scores both candidate
// rows by how many cells match a known Receipt/PAYMENT field-name token and picks
// whichever scores higher, so this works whether the real header is row 1 or row 2.
var RECEIPT_FIELD_TOKENS_ = ['TIMESTAMP','VOUCHERNUMBER','DATE','GROUP','SUBGROUP','LEDGERNAME','LEDGERAMOUNT',
  'BILLTYPE','BILLNAME','BILLAMOUNT','TYPE','BANKPARTYNAME','TRANSACTIONTYPE','INSTNO','INSTDATE','BANKNAME'];
function scoreReceiptHeaderRow_(row) {
  var score = 0;
  (row || []).forEach(function (cell) { if (RECEIPT_FIELD_TOKENS_.indexOf(normalizeHeaderText_(cell)) !== -1) score++; });
  return score;
}
function getReceiptStyleHeaderAndRows_(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(sheetName);
  if (!sh) return { headerRow: [], rows: [] };
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return { headerRow: [], rows: [] };
  var row0Score = scoreReceiptHeaderRow_(data[0]);
  var row1Score = data.length > 1 ? scoreReceiptHeaderRow_(data[1]) : -1;
  var headerIdx = (row1Score > row0Score) ? 1 : 0;
  var headerRow = data[headerIdx];
  var rows = data.slice(headerIdx + 1)
    .filter(function (row) { return row.some(function (c) { return c !== ''; }); })
    .filter(function (row) { return !looksLikeHeaderRow_(row, headerRow); });
  return { headerRow: headerRow, rows: rows };
}

// Receipt / PAYMENT mapper. Reads each field by EXACT (whitespace/underscore-
// normalized) header text instead of a hardcoded column position — per explicit
// user report with a screenshot showing the actual PAYMENT sheet's real column
// order is completely different from the originally documented layout (Group/
// Sub_Group sit near the END next to the Debit ledger block, not right after Date;
// Ledger_Name/Ledger_Amount for the Credit block sit immediately after Date, etc).
// A hardcoded positional read against that real order would silently pull every
// field from the wrong column. "Ledger_Name"/"Ledger_Amount" appear TWICE (once for
// the Credit ledger block, once for the Debit ledger block) — the FIRST occurrence
// (left-to-right column order) is treated as the Credit block, the second as Debit,
// which matches both the documented intent and the CreditLedgers/DebitLedgers
// section grouping visible in the actual sheet. Falls back to the ORIGINAL fixed
// column positions only if header-text matching finds fewer than half the expected
// fields (e.g. a sheet whose headers are blank/completely different text), so a
// sheet that genuinely still uses the old layout keeps working unchanged.
function mapReceiptRows_(rows, headerRow) {
  headerRow = headerRow || [];
  var ledgerNameIdx = findAllExactHeaderIndices_(headerRow, 'LEDGERNAME');
  var ledgerAmountIdx = findAllExactHeaderIndices_(headerRow, 'LEDGERAMOUNT');
  var idx = {
    timestamp: findExactHeaderIndex_(headerRow, 'TIMESTAMP'),
    voucherNumber: findExactHeaderIndex_(headerRow, 'VOUCHERNUMBER'),
    date: findExactHeaderIndex_(headerRow, 'DATE'),
    group: findExactHeaderIndex_(headerRow, 'GROUP'),
    subGroup: findExactHeaderIndex_(headerRow, 'SUBGROUP'),
    creditLedgerName: ledgerNameIdx.length > 0 ? ledgerNameIdx[0] : -1,
    creditLedgerAmount: ledgerAmountIdx.length > 0 ? ledgerAmountIdx[0] : -1,
    billType: findExactHeaderIndex_(headerRow, 'BILLTYPE'),
    billName: findExactHeaderIndex_(headerRow, 'BILLNAME'),
    billAmount: findExactHeaderIndex_(headerRow, 'BILLAMOUNT'),
    type: findExactHeaderIndex_(headerRow, 'TYPE'),
    debitLedgerName: ledgerNameIdx.length > 1 ? ledgerNameIdx[1] : -1,
    debitLedgerAmount: ledgerAmountIdx.length > 1 ? ledgerAmountIdx[1] : -1,
    bankPartyName: findExactHeaderIndex_(headerRow, 'BANKPARTYNAME'),
    transactionType: findExactHeaderIndex_(headerRow, 'TRANSACTIONTYPE'),
    instNo: findExactHeaderIndex_(headerRow, 'INSTNO'),
    instDate: findExactHeaderIndex_(headerRow, 'INSTDATE'),
    bankName: findExactHeaderIndex_(headerRow, 'BANKNAME')
  };
  var foundCount = Object.keys(idx).filter(function (k) { return idx[k] !== -1; }).length;
  var useHeaderText = foundCount >= 9; // at least half of the 18 fields matched by header text
  if (!useHeaderText) {
    idx = { timestamp:0, voucherNumber:1, date:2, group:3, subGroup:4, creditLedgerName:5, creditLedgerAmount:6,
      billType:7, billName:8, billAmount:9, type:10, debitLedgerName:11, debitLedgerAmount:12,
      bankPartyName:13, transactionType:14, instNo:15, instDate:16, bankName:17 };
  }
  function at(row, i) { return i === -1 ? '' : row[i]; }
  return rows.map(function (row) {
    return {
      timestamp: fmtTimestamp_(at(row, idx.timestamp)), voucherNumber: fmtValue_(at(row, idx.voucherNumber)), date: fmtDateOnly_(at(row, idx.date)),
      group: fmtValue_(at(row, idx.group)), subGroup: fmtValue_(at(row, idx.subGroup)),
      creditLedgerName: fmtValue_(at(row, idx.creditLedgerName)), creditLedgerAmount: numOrZero_(at(row, idx.creditLedgerAmount)),
      billType: fmtValue_(at(row, idx.billType)), billName: fmtValue_(at(row, idx.billName)), billAmount: numOrZero_(at(row, idx.billAmount)),
      type: fmtValue_(at(row, idx.type)),
      debitLedgerName: fmtValue_(at(row, idx.debitLedgerName)), debitLedgerAmount: numOrZero_(at(row, idx.debitLedgerAmount)),
      bankPartyName: fmtValue_(at(row, idx.bankPartyName)), transactionType: fmtValue_(at(row, idx.transactionType)),
      instNo: fmtValue_(at(row, idx.instNo)), instDate: fmtDateOnly_(at(row, idx.instDate)), bankName: fmtValue_(at(row, idx.bankName))
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

// Builds the FULL statement for EVERY party in ONE pass over the Balance rows
// (grouped by name), instead of re-reading + re-scanning the whole Balance sheet
// on every single ledger click (which is what made switching party name feel slow).
// Returned shape matches getLedgerForParty()'s single-party result, keyed by party
// name: { [partyName]: {header, opening, entries, closing} }. This is computed once
// as part of the 'balance' chunk during initial load / Sync with Tally, and the
// client caches the whole map — clicking a different party is then a pure
// client-side lookup with zero server round-trip.
function buildAllLedgers_(rows) {
  var byName = {};
  rows.forEach(function (r) {
    if (!r.name) return;
    if (!byName[r.name]) byName[r.name] = [];
    byName[r.name].push(r);
  });

  var ledgers = {};
  Object.keys(byName).forEach(function (name) {
    var partyRows = byName[name];
    var first = partyRows[0];
    var header = {
      name: first.name, alias: first.alias, subgroup: first.subgroup, group: first.group,
      mainGroup: first.mainGroup, state: first.state, country: first.country, pincode: first.pincode,
      email: first.email, emailCC: first.emailCC, contactPerson: first.contactPerson, mobile: first.mobile,
      creditPeriod: first.creditPeriod, creditLimit: first.creditLimit, billByBill: first.billByBill,
      address: first.guid /* GUID column often holds the registered address text in this export */
    };

    var openingRow = partyRows.find(function (r) { return r.openingParticular; }) || first;
    var opening = {
      date: openingRow.openingDate, particular: openingRow.openingParticular || 'Opening Balance',
      debit: openingRow.openingDebit, credit: openingRow.openingCredit, balance: openingRow.openingBalance
    };

    var running = opening.debit - opening.credit;
    var entries = [];
    partyRows.forEach(function (r) {
      if (!r.voucherDate && !r.voucherParticular && !r.voucherNo) return;
      running += (r.voucherDebit - r.voucherCredit);
      entries.push({
        date: r.voucherDate, particular: r.voucherParticular, vchType: r.voucherType, vchNo: r.voucherNo,
        debit: r.voucherDebit, credit: r.voucherCredit, balance: running
      });
    });

    var closingRow = partyRows.slice().reverse().find(function (r) { return r.closingParticular; }) || partyRows[partyRows.length - 1];
    var closing = {
      date: closingRow.closingDate, particular: closingRow.closingParticular || 'Closing Balance',
      debit: closingRow.closingDebit, credit: closingRow.closingCredit,
      balance: (closingRow.closingDebit || closingRow.closingCredit) ? (closingRow.closingDebit - closingRow.closingCredit) : running
    };

    ledgers[name] = { header: header, opening: opening, entries: entries, closing: closing };
  });
  return ledgers;
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
  var usersRaw = sheetToRows_(SHEETS.login);
  return { users: usersRaw.map(mapUserRow_).filter(function (u) { return u.id; }) };
}

// Backward-compatible endpoint for an older deployed Common.html that called
// getLoginUsers directly. New clients use getLoginData above.
function getLoginUsers() {
  return getLoginData().users;
}

// DATA LOADED IN CHUNKS — one tab per server call — to avoid exceeding
// google.script.run's response-size limit (~100-200KB). With 8000+ rows
// (growing to 10-20K), the old single-call approach silently returned null.
function getChunk(tabKey) {
  switch (tabKey) {
    case 'expense':         return mapExpense_(sheetToObjects_(SHEETS.expense));
    case 'expenseTrend':    return mapExpenseTrendRows_(sheetToRows_(SHEETS.expense));
    case 'payables':        return mapPayables_(sheetToObjects_(SHEETS.payables));
    case 'receivables':     return mapReceivablesRows_(sheetToRows_(SHEETS.receivables));
    case 'receipt': {
      var receiptData = getReceiptStyleHeaderAndRows_(SHEETS.receipt);
      return mapReceiptRows_(receiptData.rows, receiptData.headerRow);
    }
    case 'payment': {
      // Per explicit user report with a screenshot: the PAYMENT sheet has a merged
      // SECTION-TITLE row ("CreditLedgers"/"DebitLedgers" spanning several columns)
      // ABOVE the real field-name header row — getReceiptStyleHeaderAndRows_ detects
      // and skips that extra row so the real header (and therefore every data row
      // below it) is read from the correct row, instead of the section-title row
      // being mistaken for the header and the real header row then being read as
      // literal data.
      var paymentData = getReceiptStyleHeaderAndRows_(SHEETS.payment);
      return mapReceiptRows_(paymentData.rows, paymentData.headerRow);
    }
    case 'sales':           return mapSalesRows_(sheetToRows_(SHEETS.sales), getHeaderRow_(SHEETS.sales));
    // Follow-up data: legacyMap = whatever DATE/REMARKS/PROMISED AMOUNT is already
    // sitting directly on the SALES sheet per party (see getSalesFollowUpLegacyMap_)
    // + history = every individually-logged save from FOLLOWUP_LOG (append-only,
    // oldest-first) — both per explicit user report/instruction ("I CAN SEE DATA IN
    // SHEET FOR FOLLOW UP BUT SAME MISSING IN PANEL ALSO...SAVE ALL PREVIOUS FOLLOW
    // UP REMARKS ALSO AND CAN SEE ALSO WHILE FOLLOW UP").
    case 'followUp': {
      var salesHeaderRow = getHeaderRow_(SHEETS.sales);
      return {
        legacyMap: getSalesFollowUpLegacyMap_(sheetToRows_(SHEETS.sales), salesHeaderRow),
        history: getFollowUpHistory_()
      };
    }
    case 'balance': {
      var rows = mapBalanceRows_(sheetToRows_(SHEETS.balance));
      // balanceLedgers = every party's full statement, precomputed once here so the
      // client never has to call getLedgerForParty() again just to switch party name.
      return {
        balanceParties: getLedgerPartyListFromRows_(rows),
        balanceVouchers: getBalanceVouchersFromRows_(rows),
        balanceLedgers: buildAllLedgers_(rows)
      };
    }
    case 'diagnostics':     return getDiagnostics_();
    default: return [];
  }
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
    // FOLLOWUP_LOG is NOT a sheet the user needs to create themselves — it's an
    // app-managed log that gets auto-created the first time anyone saves a
    // follow-up (see ensureFollowUpLogSheet_ above). Right after this feature
    // shipped, it correctly doesn't exist yet on a sheet where no follow-up has
    // ever been saved — but getDiagnostics_() was checking it exactly like every
    // OTHER required sheet (LOGIN PAGE, EXPENSE, etc), so it incorrectly showed
    // the scary "Tab not found" Data Diagnostics banner for something that isn't
    // actually a problem at all. Per explicit user report ("aise koi tab mene add
    // nahi ki thi kabhi, why this is comig") — skipped here so it's never flagged;
    // saveFollowUp() will silently create it whenever it's actually needed.
    if (key === 'followUpLog') return;
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
    // SALES is a special case: its amount/category columns are found by searching header
    // TEXT (see mapSalesRows_), not a fixed name — so a plain missingHeaders check doesn't
    // apply. Instead, explicitly report whether the header-text search actually found a
    // match, so the banner can say "no column with TOTAL PRICE/AMOUNT in its name found"
    // instead of staying silent (this exact gap was the root cause of a prior "banner
    // never showed" bug report).
    if (tabName === SHEETS.sales) {
      var amtIdx = findColIndexByHeaderContains_(headerRow, ['TOTAL PRICE', 'TOTAL AMOUNT', 'SALE AMOUNT', 'AMOUNT']);
      var catIdx = findColIndexByHeaderContains_(headerRow, ['CATEG']);
      if (amtIdx === -1) missingHeaders.push('a column with "TOTAL PRICE" or "AMOUNT" in its header text');
      if (catIdx === -1) missingHeaders.push('a column with "CATEGORY" in its header text (optional, only affects the Sales Topline chart)');
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
 * Builds the full statement for ONE party from the Balance tab. Kept only as a
 * fallback server call for a party that isn't in the client's cached
 * balanceLedgers map yet (e.g. a brand-new party added to the sheet after the
 * last "Sync with Tally"). Normal party switching no longer calls this — see
 * buildAllLedgers_() above, which precomputes every party's ledger in one pass.
 */
// BUG FIX: the block comment above this line used to be left UNCLOSED (no closing
// `*/`) — everything below it (fmtDateISO_, findSalesFollowUpColumns_,
// getSalesFollowUpLegacyMap_, ensureFollowUpLogSheet_, appendFollowUpLog_,
// getFollowUpHistory_, and the doc-comment text of saveFollowUp) was silently
// swallowed as COMMENT TEXT instead of being real, executable function
// definitions — none of those 6 functions actually existed at runtime. This is the
// exact root cause of the reported "ReferenceError: findSalesFollowUpColumns_ is
// not defined" (thrown from saveFollowUp(), which does exist as a real function
// declaration further down, but calls a function that was never really defined).
// The file still PARSED as valid JavaScript throughout (a comment swallowing code
// is syntactically legal), which is why this slipped past a plain parse check —
// only a runtime call surfaces it. Added the missing `*/` above to close the
// comment at its intended point, restoring every function below to real code.

// Converts any date-ish value (a real Date object, or a text cell that Sheets left
// as a string) into a plain 'yyyy-MM-dd' ISO string — the exact format the client's
// fromISO() expects (see Common.html: `new Date(+p[0],+p[1]-1,+p[2])` on a '-'-split
// string). Using the display format (fmtDateOnly_, "26-Jul-2026") here instead would
// silently break every follow-up date shown in the panel, since fromISO() can't
// parse a month NAME — this bug would look exactly like "sheet has data but panel
// doesn't show it".
function fmtDateISO_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var s = String(v == null ? '' : v).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  var parsed = new Date(s);
  return isNaN(parsed.getTime()) ? '' : Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// Locates the SALES sheet's own DATE / REMARKS / PROMISED AMOUNT follow-up columns
// by searching header TEXT (same tolerant approach already used for the amount/
// category/GST columns above), instead of a hardcoded column number. This was the
// root cause of "sheet mein data hai but panel mein missing": the sheet has 2 HIDDEN
// columns elsewhere (documented at the top of this file), which silently shifts
// every fixed column-letter guess — a hardcoded column O/P/Q could easily have been
// reading/writing the WRONG columns on this specific spreadsheet. DATE is searched
// only AFTER the CATEGORY column (findColIndexByHeaderContainsAfter_) so it can
// never accidentally match column A's own Sale Date instead of this follow-up-
// specific one further right, per the user's screenshot (DESCRIPTION → TOTAL
// PRICE → CATEGORY → DATE → REMARKS → PROMISED AMOUNT).
function findSalesFollowUpColumns_(headerRow) {
  var categoryIdx = findColIndexByHeaderContains_(headerRow, ['CATEG']);
  var remarksIdx = findColIndexByHeaderContains_(headerRow, ['REMARK']);
  var promisedIdx = findColIndexByHeaderContains_(headerRow, ['PROMISED']);
  var dateIdx = findColIndexByHeaderContainsAfter_(headerRow, ['DATE'], categoryIdx === -1 ? 0 : categoryIdx);
  // Fall back to the ORIGINAL fixed positions (0-indexed 14/15/16 = columns O/P/Q)
  // only if header text truly can't be found at all, so a sheet with blank/renamed
  // headers still behaves exactly as it did before this fix.
  if (dateIdx === -1) dateIdx = 14;
  if (remarksIdx === -1) remarksIdx = 15;
  if (promisedIdx === -1) promisedIdx = 16;
  return { dateIdx: dateIdx, remarksIdx: remarksIdx, promisedIdx: promisedIdx };
}

// Reads whatever follow-up DATE/REMARKS/PROMISED AMOUNT is ALREADY sitting in the
// SALES sheet (entries made before this history-log feature existed, or typed
// directly into the sheet by someone) into a per-party map — per explicit user
// report ("I CAN SEE DATA IN SHEET FOR FOLLOW UP BUT SAME MISSING IN PANEL"). Only
// used as a fallback display entry for a party that has NO entries yet in the new
// append-only FOLLOWUP_LOG sheet (see getFollowUpHistory_ below) — once a party has
// even one logged entry, the log is authoritative and this legacy snapshot is
// ignored for that party, since the log will already include everything relevant.
function getSalesFollowUpLegacyMap_(rows, headerRow) {
  var partyColIdx = findColIndexByHeaderContains_(headerRow, ['INVOICE TO', 'CUSTOMER NAME', 'PARTY NAME', 'BUYER NAME']);
  if (partyColIdx === -1) return {};
  var cols = findSalesFollowUpColumns_(headerRow);
  var map = {};
  rows.forEach(function (row) {
    var party = String(row[partyColIdx] || '').trim();
    if (!party) return;
    var dateVal = cols.dateIdx !== -1 ? row[cols.dateIdx] : '';
    var remarksVal = cols.remarksIdx !== -1 ? row[cols.remarksIdx] : '';
    var promisedVal = cols.promisedIdx !== -1 ? row[cols.promisedIdx] : '';
    if (!dateVal && !remarksVal && !promisedVal) return; // nothing entered on this row
    var key = party.toLowerCase();
    if (!map[key]) { // first non-blank match wins — every matching row for a party carries the same values anyway
      map[key] = { party: party, date: fmtDateISO_(dateVal), remarks: fmtValue_(remarksVal), promisedAmount: promisedVal === '' ? null : numOrZero_(promisedVal) };
    }
  });
  return map;
}

// Append-only follow-up history log (auto-created on first save) — one row per
// Mark/Edit Follow Up save, EVERY save adds a new row, none is ever overwritten,
// per explicit user instruction ("SAVE ALL PREVIOUS FOLLOW UP REMARKS ALSO AND CAN
// SEE ALSO WHILE FOLLOW UP"). Kept as its own sheet (not more columns on SALES)
// specifically so history can never be capped by "one cell per row" the way the
// old SALES-column-only approach was.
function ensureFollowUpLogSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEETS.followUpLog);
  if (!sh) {
    sh = ss.insertSheet(SHEETS.followUpLog);
    sh.getRange(1, 1, 1, 5).setValues([['Timestamp', 'Party', 'Follow-up Date', 'Remarks', 'Promised Amount']]);
    sh.setFrozenRows(1);
  }
  return sh;
}
function appendFollowUpLog_(party, date, remarks, promisedAmount, timestamp) {
  var sh = ensureFollowUpLogSheet_();
  sh.appendRow([timestamp || new Date(), party || '', date || '', remarks || '', (promisedAmount === undefined || promisedAmount === null || promisedAmount === '') ? '' : promisedAmount]);
}
// Rows come back in sheet order (oldest first, since appendRow always adds to the
// bottom) — the client reverses this itself when grouping by party, so each
// party's own entries end up newest-first without needing to parse the display-
// formatted timestamp string back into a sortable value.
function getFollowUpHistory_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.followUpLog);
  if (!sh) return [];
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  var data = sh.getRange(2, 1, lastRow - 1, 5).getValues();
  return data.filter(function (row) { return row.some(function (c) { return c !== ''; }); }).map(function (row) {
    return {
      timestamp: fmtTimestamp_(row[0]), party: fmtValue_(row[1]),
      date: fmtDateISO_(row[2]), remarks: fmtValue_(row[3]),
      promisedAmount: row[4] === '' ? null : numOrZero_(row[4])
    };
  });
}

/**
 * saveFollowUp(data) — persists a follow-up note (date + remarks + promised amount)
 * TWO ways: (1) writes the LATEST values onto every SALES row matching data.party,
 * in the sheet's own DATE/REMARKS/PROMISED AMOUNT columns (located by header text —
 * see findSalesFollowUpColumns_ — not a hardcoded column letter), for at-a-glance
 * visibility directly in the spreadsheet; AND (2) appends a new row to the
 * append-only FOLLOWUP_LOG sheet, so this and every PREVIOUS save for this party
 * remain individually visible — per explicit user instruction ("SAVE ALL PREVIOUS
 * FOLLOW UP REMARKS ALSO").
 */
function saveFollowUp(data) {
  if (!data || !data.party) return {ok:false, error:'No party specified'};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEETS.sales);
  if (!sh) return {ok:false, error:'SALES sheet not found'};

  var headerRow = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var partyColIdx = findColIndexByHeaderContains_(headerRow, ['INVOICE TO', 'CUSTOMER NAME', 'PARTY NAME', 'BUYER NAME']);
  if (partyColIdx === -1) return {ok:false, error:'Party name column not found in SALES header'};

  var cols = findSalesFollowUpColumns_(headerRow);
  var lastRow = sh.getLastRow();
  var updated = 0;

  if (lastRow >= 2) {
    var partyData = sh.getRange(2, partyColIdx + 1, lastRow - 1, 1).getValues();
    var target = String(data.party).trim().toLowerCase();
    for (var i = 0; i < partyData.length; i++) {
      var cellVal = String(partyData[i][0] || '').trim().toLowerCase();
      if (cellVal === target) {
        var rowNum = i + 2;
        if (cols.dateIdx !== -1) sh.getRange(rowNum, cols.dateIdx + 1).setValue(data.date || '');
        if (cols.remarksIdx !== -1) sh.getRange(rowNum, cols.remarksIdx + 1).setValue(data.remarks || '');
        if (cols.promisedIdx !== -1) sh.getRange(rowNum, cols.promisedIdx + 1).setValue(
          (data.promisedAmount === undefined || data.promisedAmount === null || data.promisedAmount === '') ? '' : data.promisedAmount
        );
        updated++;
      }
    }
  }

  appendFollowUpLog_(data.party, data.date, data.remarks, data.promisedAmount, data.timestamp);
  return {ok:true, updated:updated};
}

/**
 * getLedgerForParty(name) — returns a single party's full ledger statement.
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
    // Same reasoning as getDiagnostics_() above: FOLLOWUP_LOG is app-managed and
    // auto-created on first follow-up save — it's expected/normal for it to not
    // exist yet, so this manual diagnostic tool shouldn't report it as an error.
    if (key === 'followUpLog') return;
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
