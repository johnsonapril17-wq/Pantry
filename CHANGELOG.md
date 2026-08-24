# Changelog

Notable changes to Pantry Tracker. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Herbs & Spices is a category again**, in chartreuse `#84cc16`, sitting after
  Pantry Staples in the store walk order. The colour was picked by measuring
  perceptual distance against the other nine in both light and dark: a cinnamon
  brown scored better on the raw swatch but its lightened dark-mode shade landed
  too close to Meat & Seafood.

### Changed

- Databases that have not migrated yet no longer fold Herbs & Spices into
  Pantry Staples at all, so their spice items keep their category. Databases
  that already ran the earlier merge get the category back, but not their
  items -- that rewrite kept no record of which items had been spices, and
  guessing would move the wrong ones. Those stay in Pantry Staples until
  reassigned by hand.

### Added

- **Category names are printed in their category's colour**, so the whole
  pantry list can be read by colour rather than word by word. The swatch stays
  alongside, holding a straight left edge down the column that names of varying
  length cannot.
- `npm run check:contrast`, which audits every theme token pair and every
  category shade against every background in the app, and fails the run rather
  than reporting.

### Fixed

- **Expired rows kept a pale pink background after switching to dark mode.**
  The row animates its background for hover feedback, and Chrome does not
  restart a running transition when the custom property behind the value
  changes -- so the row latched at the light `--danger-soft` and stayed there
  under dark text. Expired rows now take their background with no transition.

### Changed

- **All three themes are rebuilt on your Gemini colour swatch.** The twelve
  colours from the Krita swatch are split so the themes stay distinguishable:
  Farmers Market takes the greens and warm papers (olive, fern, cornsilk,
  beige), Modern Bistro sets navy against terracotta, and Minimalist takes the
  cool greys and mint. Tints, shades and every soft pair are derived from those
  twelve -- a flat swatch cannot supply a dark-mode surface ramp, and text on a
  soft background needs a shade dark enough to read. Verified at 96/96 contrast
  checks across all six theme/mode combinations. The theme preview swatches in
  Settings and the Excel export fills were updated to match.

### Changed

- **Tins & Jars and Baking are now part of Pantry Staples.** Three ambient
  categories where one does the job; the grocery list groups more tightly and
  the item form has a shorter dropdown. Existing items, grocery lines, spends
  and store aisle orders are moved across automatically, so nothing loses its
  category. (Herbs & Spices was folded in too at first, and kept — see above.)

### Added

- **Categories are colour coded.** Every category carries a swatch colour shown
  beside its name on the pantry, grocery, out-of-stock and dashboard lists, so a
  long list can be scanned by eye rather than read. Colours are editable per
  category in Settings, and print.
- A one-time data migration layer (`src/db/migrations.ts`), stamped by
  `settings.schemaVersion`. Changing the seed arrays only ever affected new
  databases; anything that has to reach existing data now has a home.


### Added

- **Item / Food is now a dropdown of everything entered before.** Picking a
  previous product refills the whole form — unit, category, location, store,
  price, low threshold and restock target — leaving only the quantity for you.
  You can still type a brand new name; the list simply gets out of the way.
  Each suggestion shows its category, location, last price and how long it
  kept, so you can tell two similar entries apart.
- Expiry is rebuilt from the *shelf life* remembered for that product rather
  than copying the old date forward, so a newly bought item is not created
  already expired.

- **Persistent storage request.** The app now calls `navigator.storage.persist()`
  on boot. Without it IndexedDB is best-effort storage, which the browser may
  evict during routine cleanup — silently, and with no way to recover. Note
  that this is a request: browsers only grant it to sites they consider
  established, so bookmarking or installing the app matters.
- **Storage & safety panel** in Settings showing whether storage is permanent,
  how much space is used, and when the last backup was taken.
- **Warning banner** shown across the app when storage is not permanent, or
  when there is data and no backup in the last 14 days. It is dismissible for
  the session and never appears on an empty app.
- Full JSON exports now record a backup timestamp, so the reminder resets.

### Added

- **The app is now installable and works offline.** Real PNG icons at 192 and
  512 px (plus maskable and Apple touch variants) and a service worker that
  caches the shell. Installing is also what most reliably earns permanent
  storage, so this is the practical fix for data being evicted.

### Fixed

- **"Make storage permanent" appeared to do nothing.** Browsers refuse the
  request for sites they do not consider established, and refuse silently — so
  the button sat there with no feedback. The refusal is now reported, with the
  two things that actually work (install the app, or bookmark it), and the
  action switches to "Back up now", which never fails. The wording no longer
  claims it "takes one click".

### Changed

- Money is shown with the narrow currency symbol, so amounts read `$12.50`
  rather than `A$12.50`. Intl prefixes the country whenever the currency is not
  the locale's own, which is right for international documents and noise in a
  household app that only deals in one currency. Applies to the Excel export
  too, so spreadsheets match the screen.

### Fixed

- Data loss was possible with no warning of any kind. The app stored everything
  in non-persistent IndexedDB, kept backup buried in Settings, and never
  explained that data is tied to one browser at one address.

## [0.1.0] — 2026-08-22

First working version, built from the handwritten notes in
[`docs/notes/`](docs/notes). See [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md)
for how those notes map onto what was built.

### Added

- **Pantry inventory** with the column set from the notes — qty, unit, item,
  category, location, price, store, stock, expiry, days left. Stock status is
  derived from quantity against a per-item low threshold and colour-coded green
  / yellow / red. Expired rows turn red end to end.
- **Grocery list that maintains itself.** Items that go low or out gain an
  `auto` line and lose it again on restock; lines added by hand are never
  removed automatically. Grouped by store, then by that store's aisle order.
  Checking out moves items into the pantry, logs their prices against the store
  and records the spend.
- **Out-of-stock tracker** with total replacement value and add-to-list ticks.
- **Price tracker** — full history per item with trend, best price seen, and
  which store averages cheapest.
- **Budget** — weekly and monthly spend against target, twelve periods of
  history, and a breakdown by store.
- **Receipts** — photograph or key in a receipt; the image is stored locally as
  a Blob and counts towards the budget.
- **Home made goods** with batch dates and recipe notes.
- **Meal prep** counted in portions rather than containers.
- **Printable stocktake sheets** carrying a QR code that resolves back to
  exactly the rows printed, so a paper walk-round can be typed back in one pass.
- **Three themes** — Farmers Market, Modern Bistro, Minimalist — each in light
  and dark, driven entirely by CSS tokens.
- **Export** to `.xlsx` with the colour code intact, pantry CSV, and full JSON
  backup with restore.

### Fixed

- **Blank screen on every page when the locale setting was invalid.** Setting
  the locale to something malformed such as `en-CAD` made the date helpers throw
  a `RangeError` from `toLocaleDateString`, and a throw during render unmounts
  the whole React tree. Because the bad value was persisted, it stayed broken
  across reloads. All locales now pass through `safeLocale()`, which falls back
  to the browser default rather than throwing; the settings fields validate as
  you type so an unusable value cannot be saved in the first place; and an
  `ErrorBoundary` now shows the actual error instead of a white page.
- **Grocery list stayed empty on load** despite items being low or out. The
  sync only ran after item edits, so data arriving any other way — a restored
  backup, a demo load, another tab — was never picked up. It now runs on boot
  as well.
- **Dates more than a year out read as though they had passed.** `18 Jun` for a
  date 300 days ahead was ambiguous; the year is now shown whenever it is not
  the current one.
- Raised contrast on the muted and faint text tiers, which fell below WCAG AA
  in the Farmers Market and Minimalist light themes.

### Notes

- Main bundle is 481 kB (151 kB gzipped). ExcelJS, the charts and the QR
  scanner load on demand rather than up front.
- All data is local to the browser. There is no server and no account.

[Unreleased]: https://github.com/johnsonapril17-wq/Pantry/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/johnsonapril17-wq/Pantry/releases/tag/v0.1.0
