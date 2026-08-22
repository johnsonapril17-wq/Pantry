# Pantry Tracker

A pantry, grocery, price and budget tracker built from the handwritten notes in
[`docs/notes/`](docs/notes). Local-first: everything lives in your browser's
IndexedDB, nothing is sent anywhere, and it works offline.

[`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) transcribes those notes and is the
source of truth for what this is meant to do.
[`CHANGELOG.md`](CHANGELOG.md) records what has changed in each version.

## Running it

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:5173. There is no account, no server and no config —
the first launch seeds a set of categories, locations and stores so you can add
an item straight away. **Settings → Load demo data** fills it with a worked
example if you want to see the moving parts before committing your own data.

| Script | Does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Typecheck, then production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Types only, no output |

## What it does

**Pantry** — the main table from the notes: qty, unit, item, category,
location, price, store, stock, expiry, days left. Stock status is *derived*
from quantity against a per-item low threshold, colour-coded green / yellow /
red. An expired row turns red end to end.

**Grocery List** — builds itself. Anything that goes low or out gains an `auto`
line; restocking removes it again. Lines you add by hand are never touched
automatically. Grouped by store, then by that store's aisle order. Checking out
moves everything into the pantry, logs the prices against the store, and records
the spend.

**Out of Stock** — everything at zero, with the replacement value across the
top and a tick to push items onto the list.

**Price Tracker** — every price you have ever paid for a thing, where, and when.
Shows the trend, the best price you have seen, and which store averages cheapest.

**Budget** — weekly and monthly spend against a budget, twelve periods of
history, and a breakdown by store.

**Receipts** — photograph or key in a receipt. The image is stored locally as a
Blob and counts towards the budget.

**Home Made** — pickles, jams, sauces, with batch dates and recipe notes.

**Meal Prep** — freezer meals counted in *portions*, not containers, so the
number you see is how many dinners you actually have banked.

**Printables + Scan** — print a stocktake sheet with a QR code, walk the pantry
writing counts in the right-hand column, then scan the code to type them back
in. The sheet's rows come up in the same order they were printed.

**Themes** — three, each in light and dark: Farmers Market (organic & fresh),
Modern Bistro (high contrast & bold), Minimalist (clean & airy).

**Export** — an `.xlsx` workbook mirroring the pantry, grocery and out-of-stock
tables with the colour code intact (opens in Excel, uploads to Google Sheets
as-is), a pantry CSV, and a full JSON backup you can restore from.

## How it is put together

```
src/
  domain/      Pure logic -- stock status, expiry, grocery sync, formatting.
               No React, no Dexie imports except in grocery.ts.
  db/          Dexie schema and first-run seed data.
  hooks/       useLiveQuery wrappers; theme application.
  components/  Layout, shared UI primitives, the shared item form, icons.
  pages/       One file per route.
  export/      Excel/CSV generation and JSON backup.
  styles/      tokens.css (themes) + base + components + print.
```

Three things are worth knowing before changing anything:

1. **Stock status is never stored.** `stockStatus()` derives it from `qty` and
   `lowThreshold` every time. Storing it would let it drift out of step with the
   quantity, and the grocery list depends on it being exact.

2. **`syncAutoGrocery()` must run after anything that can change a quantity.**
   It also runs on boot, because data can arrive without going through the UI —
   a restored backup, a demo load, another tab.

3. **Every colour comes from a token.** `styles/components.css` contains no
   literal colours. That is what keeps six theme/mode combinations honest; a
   hard-coded hex will look wrong in five of them.

## Data and privacy

Everything is in this browser's IndexedDB, including receipt photos. Clearing
site data deletes it. Use **Settings → Full backup** to get a JSON file out, and
keep it somewhere you trust.

## Known gaps

- The `.faint` text tier sits at 3.4–4.4:1 contrast depending on theme. That is
  fine for the supplementary hints it is used for, but it is below AA for body
  text, so do not promote it to carry anything important.
- Receipt photos are stored at full camera resolution. A few hundred receipts
  will make backups large; downscaling on import would be the fix.
- No unit tests yet. `src/domain/` is pure and is the obvious place to start.

## Licence

Private project, all rights reserved.
