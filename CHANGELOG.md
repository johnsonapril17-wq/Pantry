# Changelog

Notable changes to Pantry Tracker. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
