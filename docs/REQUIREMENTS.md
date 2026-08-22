# Pantry Tracker + Budget Tracker — Requirements

Transcribed from the handwritten notes in [`docs/notes/`](./notes). These photos are the
original source of truth; this document is the working interpretation of them.

| Photo | Contents |
| --- | --- |
| `01-pantry-tracker-table.jpg` | Pantry table columns, colour-coding rules, grocery list table |
| `02-feature-plan.jpg` | Overall feature plan for the app |
| `03-themes-and-printables.jpg` | Three colour themes, dark/light, section icons, printable trackers |
| `04-out-of-stock-tracker.jpg` | Out-of-stock tracker table and total value |

---

## 1. Feature plan (photo 02)

- **Pantry & Ingredient Inventory**
  - Tracks all food items, quantities and details.
  - Tracks expiry dates.
- **Filter view** — automatic feature
  - Instantly sort and filter everything by category, location/area.
- **Out of Stock tracker** — automatic feature.
- **Grocery List** — automatic feature
  - Sort by store and departments.
- **Price tracker**
  - Tracks price of each item, and the location/store purchased from.
- **Budget**
  - Track weekly budget / spending.
  - Monthly budget / spending.
  - Photo upload / manual entry for receipts.
- **Section for home made goods** — e.g. pickles, jams, sauces.
- **Freezer meals / food prepped?** — meal prep section.
- **Boxed note:** create a basic Excel and Google Docs version.

## 2. Pantry tracker table (photo 01)

Header fields:

- **Last Inventory Date**

Columns:

| Qty | Unit | Item / Food | Grocery Category | Location | Price | Store | Stock | Expiry | Days Left |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

Each row has a checkbox.

Rules:

- Items **checked off** are added to the Grocery List.
- **Low stock or out of stock** items are automatically added to the Grocery List.
- Grocery list is **sorted by store**.

Colour code (the `Stock` column):

- **In Stock** — green
- **Low** — yellow
- **Out** — red

Expiry:

- **Expired** — red; *turn the whole line red*.

## 3. Grocery List (photo 01)

Header fields:

- **Cost** — running total of the list.
- **Sort by — STORE**

Columns:

| Qty | Item / Food | Price | Category | Store |
| --- | --- | --- | --- | --- |

Each row has a checkbox (tick off as you shop).

## 4. Out of Stock Tracker (photo 04)

Header fields:

- **Out of Stock Value — $____** (total value of everything that is out)
- **Sort by — STORE**

Columns:

| add | Qty | Item / Food | Price | Category | Store |
| --- | --- | --- | --- | --- | --- |

The `add` checkbox pushes the item onto the Grocery List.

## 5. Design (photo 03)

Three colour themes:

1. **Farmers Market** — organic & fresh
2. **Modern Bistro** — high contrast & bold
3. **Minimalist** — clean & airy

- Test all themes on **both dark and light modes** (so: 3 themes × 2 modes = 6 combinations).
- Create **section icons**.
- Have **printable trackers that can be scanned back into the app to update quantities**.

---

## Derived decisions

These are not in the notes but follow from them; they are called out so they are easy to
challenge later.

1. **Stock status is derived, not typed.** Each item gets a `lowThreshold`. `qty <= 0` → Out,
   `qty <= lowThreshold` → Low, otherwise In Stock. This is what makes the out-of-stock tracker
   and grocery list "automatic features" rather than lists you maintain by hand.
2. **Grocery list entries have a source.** An entry is either `auto` (added because the item went
   low/out) or `manual` (you added it). Auto entries disappear when the item is restocked;
   manual ones do not.
3. **Price history is a log, not a field.** The `Price` column on the pantry table shows the most
   recent price paid. Every purchase appends a `PriceEntry` (item, price, store, date), which is
   what the price tracker charts.
4. **Printable trackers carry a QR code per row.** Scanning a sheet's code opens a quick-count
   screen for those rows, so a paper walk-round of the pantry can be typed back in one pass.
5. **Export, not a second app.** "Basic Excel and Google Docs version" is delivered as
   `.xlsx` / `.csv` export from the app rather than a separately maintained spreadsheet.
