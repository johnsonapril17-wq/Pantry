import type { Row } from 'exceljs';
import { db } from '@/db/schema';
import { groupByStore, outOfStockValue } from '@/domain/grocery';
import {
  STOCK_LABEL,
  daysLeft,
  expiryStatus,
  restockQty,
  stockStatus,
} from '@/domain/stock';
import type { Settings } from '@/domain/types';

/**
 * "Create a basic Excel & Google Docs version" (notes, photo 02, boxed).
 *
 * Rather than maintaining a second application, the app exports a workbook that
 * mirrors the three tracker tables from the notes -- including the colour code,
 * so the spreadsheet reads the same way the screen does. The .xlsx opens
 * directly in Excel, and uploads to Google Sheets unchanged.
 */

/** Fill colours matching the in-app status tones. */
const FILL = {
  ok: 'FFE3F0C9',
  warn: 'FFFBECCD',
  danger: 'FFF9DEDB',
  header: 'FF3F6212',
  group: 'FFEFEFE9',
} as const;

const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };

function styleHeader(row: Row): void {
  row.font = HEADER_FONT;
  row.height = 22;
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL.header } };
    cell.alignment = { vertical: 'middle' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFAAAAAA' } } };
  });
}

function tint(row: Row, argb: string): void {
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
  });
}

export async function buildWorkbook(settings: Settings): Promise<Blob> {
  const [items, grocery, stores, categories, locations, prices, spends] = await Promise.all([
    db.items.toArray(),
    db.grocery.toArray(),
    db.stores.orderBy('sortOrder').toArray(),
    db.categories.orderBy('sortOrder').toArray(),
    db.locations.orderBy('sortOrder').toArray(),
    db.priceEntries.toArray(),
    db.spends.toArray(),
  ]);

  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const locName = new Map(locations.map((l) => [l.id, l.name]));
  const storeName = new Map(stores.map((s) => [s.id, s.name]));

  // ExcelJS is ~800 kB and only needed the moment someone actually exports, so
  // it is pulled in on demand rather than shipped in the main bundle.
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Pantry Tracker';
  wb.created = new Date();

  const currencyFmt = `"${currencySymbol(settings)}"#,##0.00`;

  /* --- Sheet 1: Pantry Tracker ----------------------------------------- */

  const pantry = wb.addWorksheet('Pantry Tracker', {
    views: [{ state: 'frozen', ySplit: 2 }],
  });

  pantry.mergeCells('A1:J1');
  const titleCell = pantry.getCell('A1');
  titleCell.value = `Pantry Tracker — last inventory ${settings.lastInventoryDate ?? 'not recorded'}`;
  titleCell.font = { bold: true, size: 13 };
  pantry.getRow(1).height = 24;

  pantry.columns = [
    { key: 'qty', width: 8 },
    { key: 'unit', width: 10 },
    { key: 'name', width: 30 },
    { key: 'category', width: 18 },
    { key: 'location', width: 18 },
    { key: 'price', width: 12 },
    { key: 'store', width: 20 },
    { key: 'stock', width: 12 },
    { key: 'expiry', width: 12 },
    { key: 'daysLeft', width: 11 },
  ];

  styleHeader(
    pantry.addRow([
      'Qty',
      'Unit',
      'Item / Food',
      'Grocery Category',
      'Location',
      'Price',
      'Store',
      'Stock',
      'Expiry',
      'Days Left',
    ]),
  );

  for (const item of items.filter((i) => i.kind === 'pantry' && !i.archived)) {
    const status = stockStatus(item);
    const exp = expiryStatus(item.expiry, settings.expiryWarnDays);
    const row = pantry.addRow([
      item.qty,
      item.unit,
      item.name,
      catName.get(item.categoryId) ?? '',
      locName.get(item.locationId) ?? '',
      item.price ?? null,
      storeName.get(item.storeId ?? '') ?? '',
      STOCK_LABEL[status],
      item.expiry ? new Date(item.expiry) : null,
      daysLeft(item.expiry),
    ]);

    row.getCell('price').numFmt = currencyFmt;
    row.getCell('expiry').numFmt = 'dd mmm yyyy';

    // Colour code from the notes: green in stock, yellow low, red out.
    row.getCell('stock').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: status === 'in' ? FILL.ok : status === 'low' ? FILL.warn : FILL.danger },
    };

    // "Expired - turn whole line red".
    if (exp === 'expired') tint(row, FILL.danger);
  }

  pantry.autoFilter = { from: 'A2', to: { row: 2, column: 10 } };

  /* --- Sheet 2: Grocery List ------------------------------------------- */

  const list = wb.addWorksheet('Grocery List', { views: [{ state: 'frozen', ySplit: 3 }] });
  const groups = groupByStore(
    grocery.filter((g) => !g.checked),
    stores,
    categories,
  );
  const listTotalValue = groups.reduce((n, g) => n + g.subtotal, 0);

  list.mergeCells('A1:E1');
  const listTitle = list.getCell('A1');
  listTitle.value = `Grocery List — estimated cost ${formatMoney(listTotalValue, settings)}`;
  listTitle.font = { bold: true, size: 13 };
  list.getRow(1).height = 24;

  list.columns = [
    { key: 'done', width: 7 },
    { key: 'qty', width: 8 },
    { key: 'name', width: 32 },
    { key: 'price', width: 12 },
    { key: 'category', width: 20 },
  ];

  styleHeader(list.addRow(['Done', 'Qty', 'Item / Food', 'Price', 'Category']));

  for (const group of groups) {
    const header = list.addRow([
      '',
      '',
      `${group.storeName}`,
      group.subtotal || null,
      `${group.entries.length} items`,
    ]);
    header.font = { bold: true };
    header.getCell('price').numFmt = currencyFmt;
    tint(header, FILL.group);

    for (const e of group.entries) {
      const row = list.addRow([
        '',
        `${e.qty}${e.unit !== 'ea' ? ` ${e.unit}` : ''}`,
        e.name,
        e.price != null ? e.price * e.qty : null,
        catName.get(e.categoryId) ?? '',
      ]);
      row.getCell('price').numFmt = currencyFmt;
    }
  }

  /* --- Sheet 3: Out of Stock ------------------------------------------- */

  const oos = wb.addWorksheet('Out of Stock', { views: [{ state: 'frozen', ySplit: 3 }] });
  const outItems = items.filter((i) => i.kind === 'pantry' && !i.archived && stockStatus(i) === 'out');

  oos.mergeCells('A1:E1');
  const oosTitle = oos.getCell('A1');
  oosTitle.value = `Out of Stock — replacement value ${formatMoney(outOfStockValue(items), settings)}`;
  oosTitle.font = { bold: true, size: 13 };
  oos.getRow(1).height = 24;

  oos.columns = [
    { key: 'add', width: 7 },
    { key: 'qty', width: 8 },
    { key: 'name', width: 32 },
    { key: 'price', width: 12 },
    { key: 'category', width: 20 },
    { key: 'store', width: 20 },
  ];

  styleHeader(oos.addRow(['Add', 'Buy', 'Item / Food', 'Price', 'Category', 'Store']));

  for (const item of outItems.sort(
    (a, b) =>
      (storeName.get(a.storeId ?? '') ?? '').localeCompare(storeName.get(b.storeId ?? '') ?? '') ||
      a.name.localeCompare(b.name),
  )) {
    const row = oos.addRow([
      '',
      restockQty(item),
      item.name,
      item.price != null ? item.price * restockQty(item) : null,
      catName.get(item.categoryId) ?? '',
      storeName.get(item.storeId ?? '') ?? '',
    ]);
    row.getCell('price').numFmt = currencyFmt;
  }

  /* --- Sheet 4: Home Made + Meal Prep ---------------------------------- */

  const made = wb.addWorksheet('Home Made & Meal Prep');
  made.columns = [
    { key: 'kind', width: 14 },
    { key: 'name', width: 32 },
    { key: 'qty', width: 8 },
    { key: 'unit', width: 12 },
    { key: 'portions', width: 10 },
    { key: 'made', width: 14 },
    { key: 'useBy', width: 14 },
    { key: 'location', width: 18 },
    { key: 'recipe', width: 46 },
  ];
  styleHeader(
    made.addRow([
      'Section',
      'Name',
      'Qty',
      'Unit',
      'Portions',
      'Made on',
      'Use by',
      'Location',
      'Recipe / notes',
    ]),
  );

  for (const item of items.filter((i) => i.kind !== 'pantry' && !i.archived)) {
    const row = made.addRow([
      item.kind === 'homemade' ? 'Home made' : 'Meal prep',
      item.name,
      item.qty,
      item.unit,
      item.portions ?? null,
      item.batchDate ? new Date(item.batchDate) : null,
      item.expiry ? new Date(item.expiry) : null,
      locName.get(item.locationId) ?? '',
      item.recipe ?? item.notes ?? '',
    ]);
    row.getCell('made').numFmt = 'dd mmm yyyy';
    row.getCell('useBy').numFmt = 'dd mmm yyyy';
    if (expiryStatus(item.expiry, settings.expiryWarnDays) === 'expired') tint(row, FILL.danger);
  }

  /* --- Sheet 5: Price History ------------------------------------------ */

  const priceSheet = wb.addWorksheet('Price History');
  priceSheet.columns = [
    { key: 'date', width: 14 },
    { key: 'name', width: 32 },
    { key: 'price', width: 12 },
    { key: 'qty', width: 8 },
    { key: 'unit', width: 10 },
    { key: 'store', width: 22 },
  ];
  styleHeader(priceSheet.addRow(['Date', 'Item / Food', 'Price', 'Qty', 'Unit', 'Store']));

  for (const p of [...prices].sort((a, b) => b.date.localeCompare(a.date))) {
    const row = priceSheet.addRow([
      new Date(p.date),
      p.name,
      p.price,
      p.qty,
      p.unit,
      storeName.get(p.storeId ?? '') ?? '',
    ]);
    row.getCell('date').numFmt = 'dd mmm yyyy';
    row.getCell('price').numFmt = currencyFmt;
  }

  /* --- Sheet 6: Spending ------------------------------------------------ */

  const budget = wb.addWorksheet('Spending');
  budget.columns = [
    { key: 'date', width: 14 },
    { key: 'amount', width: 12 },
    { key: 'store', width: 22 },
    { key: 'note', width: 40 },
  ];
  styleHeader(budget.addRow(['Date', 'Amount', 'Store', 'Note']));

  for (const s of [...spends].sort((a, b) => b.date.localeCompare(a.date))) {
    const row = budget.addRow([
      new Date(s.date),
      s.amount,
      storeName.get(s.storeId ?? '') ?? '',
      s.note ?? '',
    ]);
    row.getCell('date').numFmt = 'dd mmm yyyy';
    row.getCell('amount').numFmt = currencyFmt;
  }

  const totalRow = budget.addRow(['', spends.reduce((n, s) => n + s.amount, 0), '', 'Total']);
  totalRow.font = { bold: true };
  totalRow.getCell('amount').numFmt = currencyFmt;

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/* -------------------------------------------------------------------------- */
/* CSV -- the lowest-common-denominator import for Google Sheets              */
/* -------------------------------------------------------------------------- */

export async function buildPantryCsv(settings: Settings): Promise<Blob> {
  const [items, categories, locations, stores] = await Promise.all([
    db.items.toArray(),
    db.categories.toArray(),
    db.locations.toArray(),
    db.stores.toArray(),
  ]);

  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const locName = new Map(locations.map((l) => [l.id, l.name]));
  const storeName = new Map(stores.map((s) => [s.id, s.name]));

  const header = [
    'Qty',
    'Unit',
    'Item / Food',
    'Grocery Category',
    'Location',
    'Price',
    'Store',
    'Stock',
    'Expiry',
    'Days Left',
  ];

  const rows = items
    .filter((i) => i.kind === 'pantry' && !i.archived)
    .map((item) => [
      item.qty,
      item.unit,
      item.name,
      catName.get(item.categoryId) ?? '',
      locName.get(item.locationId) ?? '',
      item.price ?? '',
      storeName.get(item.storeId ?? '') ?? '',
      STOCK_LABEL[stockStatus(item)],
      item.expiry ?? '',
      daysLeft(item.expiry) ?? '',
    ]);

  void settings;
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  return new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
}

function csvCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/* -------------------------------------------------------------------------- */

function currencySymbol(settings: Settings): string {
  try {
    const parts = new Intl.NumberFormat(settings.locale, {
      style: 'currency',
      currency: settings.currency,
    }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value ?? '$';
  } catch {
    return '$';
  }
}

function formatMoney(value: number, settings: Settings): string {
  try {
    return new Intl.NumberFormat(settings.locale, {
      style: 'currency',
      currency: settings.currency,
    }).format(value);
  } catch {
    return value.toFixed(2);
  }
}

/** Triggers a browser download for a generated Blob. */
export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the download a tick to start before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
