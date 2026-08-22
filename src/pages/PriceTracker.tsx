import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Plus, Tag, Trash2 } from 'lucide-react';
import { Page } from '@/components/Layout';
import { Badge, EmptyState, Field, Modal, SearchInput, Stat, useToast } from '@/components/ui';
import { UNITS } from '@/components/ItemForm';
import { db, now, uid } from '@/db/schema';
import { byId, useItems, usePriceEntries, useSettings, useStores } from '@/hooks/useData';
import { money, shortDate, toISODate } from '@/domain/format';
import type { PriceEntry } from '@/domain/types';

/**
 * "Price tracker -- tracks price of each item and location/store purchased
 * from" (notes, photo 02).
 *
 * Every price observation is a row. Rows come from checking out a grocery list,
 * from entering a receipt, or by hand here. The unit price is what gets
 * compared, so buying 2L of milk and 1L of milk are directly comparable.
 */
export function PriceTracker() {
  const entries = usePriceEntries();
  const stores = useStores();
  const items = useItems();
  const settings = useSettings();
  const toast = useToast();

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const strs = byId(stores);

  /** One summary row per distinct product name. */
  const products = useMemo(() => {
    const map = new Map<
      string,
      { name: string; rows: PriceEntry[]; latest: number; best: number; worst: number }
    >();

    for (const e of entries) {
      const key = e.name.toLowerCase();
      const unitPrice = e.qty > 0 ? e.price : e.price;
      const bucket = map.get(key);
      if (bucket) {
        bucket.rows.push(e);
      } else {
        map.set(key, {
          name: e.name,
          rows: [e],
          latest: unitPrice,
          best: unitPrice,
          worst: unitPrice,
        });
      }
    }

    for (const b of map.values()) {
      // `entries` arrives newest-first, so index 0 is the current price.
      b.rows.sort((a, z) => z.date.localeCompare(a.date));
      const prices = b.rows.map((r) => r.price);
      b.latest = prices[0];
      b.best = Math.min(...prices);
      b.worst = Math.max(...prices);
    }

    const q = query.trim().toLowerCase();
    return [...map.values()]
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [entries, query]);

  const active = useMemo(
    () => products.find((p) => p.name.toLowerCase() === selected?.toLowerCase()) ?? products[0],
    [products, selected],
  );

  const chartData = useMemo(() => {
    if (!active) return [];
    return [...active.rows]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => ({
        date: shortDate(r.date, settings.locale),
        price: r.price,
        store: strs.get(r.storeId ?? '')?.name ?? 'Unknown',
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, settings.locale, stores]);

  /** Cheapest store per product, across all observations. */
  const bestStore = useMemo(() => {
    if (!active) return null;
    const byStore = new Map<string, number[]>();
    for (const r of active.rows) {
      const key = r.storeId ?? '';
      const list = byStore.get(key);
      if (list) list.push(r.price);
      else byStore.set(key, [r.price]);
    }
    let best: { name: string; avg: number } | null = null;
    for (const [storeId, prices] of byStore) {
      const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
      const name = strs.get(storeId)?.name ?? 'Unknown store';
      if (!best || avg < best.avg) best = { name, avg };
    }
    return best;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stores]);

  const trend = useMemo(() => {
    if (!active || active.rows.length < 2) return 0;
    const latest = active.rows[0].price;
    const previous = active.rows[1].price;
    if (!previous) return 0;
    return ((latest - previous) / previous) * 100;
  }, [active]);

  return (
    <Page
      title="Price Tracker"
      subtitle={`${products.length} products · ${entries.length} price observations`}
      actions={
        <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          <Plus size={15} />
          Log a price
        </button>
      }
    >
      {entries.length === 0 ? (
        <div className="card">
          <div className="card-body">
            <EmptyState
              icon={<Tag size={22} />}
              title="No prices logged yet"
              message="Prices are recorded automatically when you check out a grocery list or enter a receipt. You can also log one by hand."
              action={
                <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
                  <Plus size={15} /> Log a price
                </button>
              }
            />
          </div>
        </div>
      ) : (
        <>
          {active && (
            <div className="stat-grid">
              <Stat
                label="Latest price"
                value={money(active.latest, settings.locale, settings.currency)}
                hint={active.name}
              />
              <Stat
                label="Best ever"
                value={money(active.best, settings.locale, settings.currency)}
                tone="ok"
                hint={
                  active.best < active.latest
                    ? `${money(active.latest - active.best, settings.locale, settings.currency)} above best`
                    : 'You are at the best price'
                }
              />
              <Stat
                label="Change"
                value={
                  <span className="row" style={{ gap: 4 }}>
                    {trend > 0.5 ? (
                      <ArrowUpRight size={20} />
                    ) : trend < -0.5 ? (
                      <ArrowDownRight size={20} />
                    ) : (
                      <ArrowRight size={20} />
                    )}
                    {trend === 0 ? '--' : `${trend > 0 ? '+' : ''}${trend.toFixed(1)}%`}
                  </span>
                }
                tone={trend > 0.5 ? 'danger' : trend < -0.5 ? 'ok' : undefined}
                hint="Since the previous purchase"
              />
              <Stat
                label="Cheapest store"
                value={<span style={{ fontSize: '1.05rem' }}>{bestStore?.name ?? '--'}</span>}
                hint={
                  bestStore ? `Averages ${money(bestStore.avg, settings.locale, settings.currency)}` : undefined
                }
              />
            </div>
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(240px, 320px) 1fr',
              gap: 'var(--space-5)',
              alignItems: 'start',
            }}
            className="price-layout"
          >
            <div className="card">
              <div className="card-head">
                <SearchInput value={query} onChange={setQuery} placeholder="Find a product..." />
              </div>
              <div className="card-body flush" style={{ maxHeight: 520, overflowY: 'auto' }}>
                <table className="table">
                  <tbody>
                    {products.map((p) => {
                      const isActive = active?.name === p.name;
                      return (
                        <tr
                          key={p.name}
                          onClick={() => setSelected(p.name)}
                          style={{
                            cursor: 'pointer',
                            background: isActive ? 'var(--accent-soft)' : undefined,
                          }}
                        >
                          <td>
                            <span className="item-name">{p.name}</span>
                            <div className="tiny faint">{p.rows.length} observations</div>
                          </td>
                          <td className="col-num">
                            <div className="strong">
                              {money(p.latest, settings.locale, settings.currency)}
                            </div>
                            {p.best < p.latest && (
                              <div className="tiny" style={{ color: 'var(--ok)' }}>
                                best {money(p.best, settings.locale, settings.currency)}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <h2>{active?.name ?? 'Select a product'}</h2>
                {active && (
                  <Badge tone="neutral">
                    {active.rows.length} purchase{active.rows.length === 1 ? '' : 's'}
                  </Badge>
                )}
              </div>

              {chartData.length > 1 && (
                <div className="card-body" style={{ height: 230 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="date"
                        stroke="var(--text-faint)"
                        fontSize={11}
                        tickLine={false}
                        axisLine={{ stroke: 'var(--border)' }}
                      />
                      <YAxis
                        stroke="var(--text-faint)"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        width={54}
                        tickFormatter={(v) => money(v, settings.locale, settings.currency)}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius)',
                          color: 'var(--text)',
                          fontSize: 12,
                        }}
                        formatter={(v: number, _n, p) => [
                          money(v, settings.locale, settings.currency),
                          p.payload.store,
                        ]}
                      />
                      <Line
                        type="monotone"
                        dataKey="price"
                        stroke="var(--accent)"
                        strokeWidth={2}
                        dot={{ r: 3, fill: 'var(--accent)' }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="card-body flush">
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th className="col-num">Price</th>
                        <th className="col-num">Qty</th>
                        <th>Store</th>
                        <th className="col-tight" />
                      </tr>
                    </thead>
                    <tbody>
                      {active?.rows.map((r) => (
                        <tr key={r.id}>
                          <td className="nowrap">{shortDate(r.date, settings.locale)}</td>
                          <td className="col-num strong">
                            {money(r.price, settings.locale, settings.currency)}
                          </td>
                          <td className="col-num muted">
                            {r.qty} {r.unit !== 'ea' ? r.unit : ''}
                          </td>
                          <td className="small muted">
                            {strs.get(r.storeId ?? '')?.name ?? '--'}
                          </td>
                          <td className="col-tight">
                            <button
                              className="btn btn-ghost btn-icon"
                              onClick={async () => {
                                await db.priceEntries.delete(r.id);
                                toast('Price observation removed.');
                              }}
                              aria-label="Delete observation"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {adding && <LogPriceModal onClose={() => setAdding(false)} itemNames={items.map((i) => i.name)} />}

      <style>{`
        @media (max-width: 1000px) {
          .price-layout { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </Page>
  );
}

function LogPriceModal({ onClose, itemNames }: { onClose: () => void; itemNames: string[] }) {
  const stores = useStores();
  const items = useItems();
  const toast = useToast();

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState(1);
  const [unit, setUnit] = useState('ea');
  const [storeId, setStoreId] = useState('');
  const [date, setDate] = useState(toISODate(new Date()));
  const [updateItem, setUpdateItem] = useState(true);

  const save = async () => {
    if (!name.trim() || price === '') {
      toast('Name and price are both needed.', 'danger');
      return;
    }
    const match = items.find((i) => i.name.toLowerCase() === name.trim().toLowerCase());

    await db.priceEntries.add({
      id: uid(),
      itemId: match?.id,
      name: name.trim(),
      price: Number(price),
      qty,
      unit,
      storeId: storeId || undefined,
      date,
    });

    if (match && updateItem) {
      await db.items.update(match.id, { price: Number(price), updatedAt: now() });
    }

    toast(`Logged ${name.trim()}.`, 'ok');
    onClose();
  };

  return (
    <Modal
      title="Log a price"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save}>
            Log price
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Item / Food" span hint="Matching an existing pantry item links the history to it.">
          <input
            className="input"
            autoFocus
            list="known-items"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <datalist id="known-items">
            {itemNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </Field>
        <Field label="Price">
          <input
            className="input"
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </Field>
        <Field label="Quantity">
          <input
            className="input"
            type="number"
            min="0"
            step="any"
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
          />
        </Field>
        <Field label="Unit">
          <input className="input" list="unit-options" value={unit} onChange={(e) => setUnit(e.target.value)} />
          <datalist id="unit-options">
            {UNITS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </Field>
        <Field label="Store">
          <select className="select" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            <option value="">Not recorded</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date" span>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>

      <hr className="divider" />

      <label className="row" style={{ cursor: 'pointer' }}>
        <input
          type="checkbox"
          className="checkbox"
          checked={updateItem}
          onChange={(e) => setUpdateItem(e.target.checked)}
        />
        <span className="small">Also update the pantry item's current price</span>
      </label>
    </Modal>
  );
}
