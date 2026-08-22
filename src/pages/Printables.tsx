import { Fragment, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Printer, ScanLine } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Page } from '@/components/Layout';
import { SegmentedControl } from '@/components/ui';
import { db, now, uid } from '@/db/schema';
import { byId, useCategories, useGrocery, useItems, useLocations, useSettings, useStores } from '@/hooks/useData';
import { groupByStore } from '@/domain/grocery';
import { mediumDate, money, shortDate, toISODate } from '@/domain/format';
import { stockStatus } from '@/domain/stock';
import type { Item } from '@/domain/types';

type SheetKind = 'stocktake' | 'grocery' | 'outofstock';

/**
 * "Have printable trackers that can be scanned into the app to update
 * quantities" (notes, photo 03).
 *
 * A stocktake sheet is registered as a `PrintBatch` with a short code. The QR
 * code encodes `pantry://count/<code>`, which the Scan page resolves back to
 * the exact rows on that sheet -- so you walk the pantry with paper, then scan
 * and key the counts in one pass.
 */
export function Printables() {
  const items = useItems();
  const categories = useCategories();
  const locations = useLocations();
  const stores = useStores();
  const grocery = useGrocery();
  const settings = useSettings();

  const [kind, setKind] = useState<SheetKind>('stocktake');
  const [locationId, setLocationId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [batchCode, setBatchCode] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const cats = byId(categories);
  const locs = byId(locations);

  const stocktakeRows = useMemo(() => {
    return items
      .filter((i) => {
        if (locationId && i.locationId !== locationId) return false;
        if (categoryId && i.categoryId !== categoryId) return false;
        return true;
      })
      .sort((a, b) => {
        const la = locs.get(a.locationId)?.sortOrder ?? 999;
        const lb = locs.get(b.locationId)?.sortOrder ?? 999;
        if (la !== lb) return la - lb;
        const ca = cats.get(a.categoryId)?.sortOrder ?? 999;
        const cb = cats.get(b.categoryId)?.sortOrder ?? 999;
        if (ca !== cb) return ca - cb;
        return a.name.localeCompare(b.name);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, locationId, categoryId, locations, categories]);

  const groceryGroups = useMemo(
    () => groupByStore(grocery.filter((g) => !g.checked), stores, categories),
    [grocery, stores, categories],
  );

  const outRows = useMemo(
    () => items.filter((i) => i.kind === 'pantry' && stockStatus(i) === 'out'),
    [items],
  );

  /**
   * Register the sheet before printing so the printed code is resolvable. The
   * batch is recreated whenever the row set changes, which keeps a scanned code
   * pointing at exactly the rows that were on the paper.
   */
  useEffect(() => {
    if (kind !== 'stocktake' || stocktakeRows.length === 0) {
      setBatchCode(null);
      setQrDataUrl(null);
      return;
    }

    let cancelled = false;
    const code = `PT-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    (async () => {
      const id = uid();
      await db.printBatches.add({
        id,
        code,
        title: sheetTitle(locationId ? locs.get(locationId)?.name : undefined),
        itemIds: stocktakeRows.map((r) => r.id),
        createdAt: now(),
      });

      const url = await QRCode.toDataURL(`pantry://count/${code}`, {
        margin: 0,
        width: 240,
        errorCorrectionLevel: 'M',
        color: { dark: '#000000', light: '#ffffff' },
      });

      if (!cancelled) {
        setBatchCode(code);
        setQrDataUrl(url);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, stocktakeRows.map((r) => r.id).join(','), locationId]);

  const printedOn = mediumDate(toISODate(new Date()), settings.locale);

  return (
    <Page
      title="Printables"
      subtitle="Paper trackers you can carry round the pantry, then scan back in"
      actions={
        <>
          <Link to="/scan" className="btn btn-sm">
            <ScanLine size={15} />
            Scan a sheet
          </Link>
          <button className="btn btn-primary btn-sm" onClick={() => window.print()}>
            <Printer size={15} />
            Print
          </button>
        </>
      }
    >
      <div className="card no-print">
        <div className="card-head" style={{ flexWrap: 'wrap' }}>
          <SegmentedControl<SheetKind>
            value={kind}
            onChange={setKind}
            options={[
              { value: 'stocktake', label: 'Stocktake sheet' },
              { value: 'grocery', label: 'Grocery list' },
              { value: 'outofstock', label: 'Out of stock' },
            ]}
          />
          {kind === 'stocktake' && (
            <div className="toolbar">
              <select
                className="select"
                style={{ width: 'auto' }}
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
              >
                <option value="">All locations</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <select
                className="select"
                style={{ width: 'auto' }}
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="card-body small muted">
          {kind === 'stocktake' ? (
            <>
              Each sheet carries a unique code ({batchCode ? <code>{batchCode}</code> : 'generating'}
              ). Write the counts in the right-hand column, then{' '}
              <Link to="/scan">scan the QR code</Link> to type them straight back in.
            </>
          ) : kind === 'grocery' ? (
            'A tick-off shopping list grouped by store, in aisle order.'
          ) : (
            'Everything currently at zero, with replacement prices.'
          )}
        </div>
      </div>

      {kind === 'stocktake' && (
        <StocktakeSheet
          rows={stocktakeRows}
          title={sheetTitle(locationId ? locs.get(locationId)?.name : undefined)}
          code={batchCode}
          qr={qrDataUrl}
          printedOn={printedOn}
          categoryName={(id) => cats.get(id)?.name ?? ''}
          locationName={(id) => locs.get(id)?.name ?? ''}
          locale={settings.locale}
        />
      )}

      {kind === 'grocery' && (
        <div className="print-sheet">
          <div className="print-head">
            <div>
              <h1>Grocery List</h1>
              <div className="meta">
                Printed {printedOn} · {groceryGroups.reduce((n, g) => n + g.entries.length, 0)} items
                <br />
                Sorted by store, then aisle order
              </div>
            </div>
          </div>

          <table className="print-table">
            <thead>
              <tr>
                <th style={{ width: '8mm' }} />
                <th style={{ width: '16mm' }}>Qty</th>
                <th>Item / Food</th>
                <th style={{ width: '22mm' }}>Price</th>
                <th style={{ width: '38mm' }}>Category</th>
              </tr>
            </thead>
            <tbody>
              {groceryGroups.map((g) => (
                <Fragment key={g.storeId ?? 'none'}>
                  <tr className="print-group">
                    <td colSpan={5}>
                      <div className="cell">
                        {g.storeName} — {money(g.subtotal, settings.locale, settings.currency)}
                      </div>
                    </td>
                  </tr>
                  {g.entries.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <div className="cell center">
                          <span className="tick" />
                        </div>
                      </td>
                      <td>
                        <div className="cell qty-now">
                          {e.qty} {e.unit !== 'ea' ? e.unit : ''}
                        </div>
                      </td>
                      <td>
                        <div className="cell">{e.name}</div>
                      </td>
                      <td>
                        <div className="cell qty-now">
                          {e.price == null ? '' : money(e.price * e.qty, settings.locale, settings.currency)}
                        </div>
                      </td>
                      <td>
                        <div className="cell">{cats.get(e.categoryId)?.name ?? ''}</div>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>

          <div className="print-foot">
            <span>Pantry Tracker</span>
            <span>
              Estimated total:{' '}
              {money(
                groceryGroups.reduce((n, g) => n + g.subtotal, 0),
                settings.locale,
                settings.currency,
              )}
            </span>
          </div>
        </div>
      )}

      {kind === 'outofstock' && (
        <div className="print-sheet">
          <div className="print-head">
            <div>
              <h1>Out of Stock</h1>
              <div className="meta">
                Printed {printedOn} · {outRows.length} items at zero
                <br />
                Replacement value:{' '}
                {money(
                  outRows.reduce((s, i) => s + (i.price ?? 0) * (i.restockTo ?? i.lowThreshold + 1), 0),
                  settings.locale,
                  settings.currency,
                )}
              </div>
            </div>
          </div>

          <table className="print-table">
            <thead>
              <tr>
                <th style={{ width: '8mm' }} />
                <th>Item / Food</th>
                <th style={{ width: '20mm' }}>Buy</th>
                <th style={{ width: '22mm' }}>Price</th>
                <th style={{ width: '36mm' }}>Store</th>
              </tr>
            </thead>
            <tbody>
              {outRows.map((i) => (
                <tr key={i.id}>
                  <td>
                    <div className="cell center">
                      <span className="tick" />
                    </div>
                  </td>
                  <td>
                    <div className="cell">{i.name}</div>
                  </td>
                  <td>
                    <div className="cell qty-now">
                      {i.restockTo ?? i.lowThreshold + 1} {i.unit !== 'ea' ? i.unit : ''}
                    </div>
                  </td>
                  <td>
                    <div className="cell qty-now">
                      {i.price == null ? '' : money(i.price, settings.locale, settings.currency)}
                    </div>
                  </td>
                  <td>
                    <div className="cell">{stores.find((s) => s.id === i.storeId)?.name ?? ''}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="print-foot">
            <span>Pantry Tracker</span>
            <span>{printedOn}</span>
          </div>
        </div>
      )}

      <div className="no-print small muted">
        Tip: print at 100% scale with margins set to "None" — the sheet already leaves a 12&nbsp;mm
        border.
      </div>
    </Page>
  );
}

function sheetTitle(locationName?: string): string {
  return locationName ? `Stocktake — ${locationName}` : 'Stocktake — All locations';
}

/* -------------------------------------------------------------------------- */

function StocktakeSheet({
  rows,
  title,
  code,
  qr,
  printedOn,
  categoryName,
  locationName,
  locale,
}: {
  rows: Item[];
  title: string;
  code: string | null;
  qr: string | null;
  printedOn: string;
  categoryName: (id: string) => string;
  locationName: (id: string) => string;
  locale: string;
}) {
  // Group by location so the sheet reads in the order you actually walk.
  const groups = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const r of rows) {
      const list = map.get(r.locationId);
      if (list) list.push(r);
      else map.set(r.locationId, [r]);
    }
    return [...map.entries()];
  }, [rows]);

  return (
    <div className="print-sheet">
      <div className="print-head">
        <div>
          <h1>{title}</h1>
          <div className="meta">
            Printed {printedOn} · {rows.length} items
            <br />
            Sheet code: <strong>{code ?? '—'}</strong>
          </div>
        </div>
        {qr && (
          <div className="qr">
            <img src={qr} alt={`QR code for sheet ${code}`} />
            <div className="cap">SCAN TO ENTER COUNTS</div>
          </div>
        )}
      </div>

      <div className="print-instructions">
        <b>How to use:</b> walk the pantry and write the count you actually see in the{' '}
        <b>New count</b> column. Leave a row blank to keep its current number. When you are done,
        open the app, go to <b>Scan Sheet</b>, and scan the QR code above — the sheet's rows come up
        ready to type in.
      </div>

      <table className="print-table">
        <thead>
          <tr>
            <th style={{ width: '14mm' }}>Row</th>
            <th>Item / Food</th>
            <th style={{ width: '30mm' }}>Category</th>
            <th style={{ width: '18mm' }}>Now</th>
            <th style={{ width: '20mm' }}>Expiry</th>
            <th style={{ width: '26mm' }}>New count</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(([locId, list]) => (
            <Fragment key={locId}>
              <tr className="print-group">
                <td colSpan={6}>
                  <div className="cell">
                    {locationName(locId)} — {list.length} items
                  </div>
                </td>
              </tr>
              {list.map((item) => {
                const index = rows.indexOf(item) + 1;
                return (
                  <tr key={item.id}>
                    <td>
                      <div className="cell rowcode">{String(index).padStart(2, '0')}</div>
                    </td>
                    <td>
                      <div className="cell">{item.name}</div>
                    </td>
                    <td>
                      <div className="cell">{categoryName(item.categoryId)}</div>
                    </td>
                    <td>
                      <div className="cell qty-now">
                        {item.qty} {item.unit !== 'ea' ? item.unit : ''}
                      </div>
                    </td>
                    <td>
                      <div className="cell">{item.expiry ? shortDate(item.expiry, locale) : ''}</div>
                    </td>
                    <td className="write">
                      <div className="box" />
                    </td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>

      <div className="print-foot">
        <span>Pantry Tracker · sheet {code ?? '—'}</span>
        <span>Counted by ______________ on ____ / ____ / ______</span>
      </div>
    </div>
  );
}
