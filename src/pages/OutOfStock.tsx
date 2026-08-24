import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PackageCheck, PackageX, Plus, ShoppingCart } from 'lucide-react';
import { CategoryTag } from '@/components/CategoryTag';
import { Page } from '@/components/Layout';
import { Badge, EmptyState, SegmentedControl, Stat, useToast } from '@/components/ui';
import { db, now } from '@/db/schema';
import { byId, useCategories, useGrocery, useItems, useSettings, useStores } from '@/hooks/useData';
import { addItemToGrocery, outOfStockValue, syncAutoGrocery } from '@/domain/grocery';
import { money } from '@/domain/format';
import { restockQty, round2, stockStatus } from '@/domain/stock';
import type { Item } from '@/domain/types';

type Scope = 'out' | 'lowAndOut';

/**
 * "Out of Stock Tracker" (notes, photo 04): everything that has hit zero, with
 * the replacement value across the top and an `add` tick that pushes a line
 * onto the grocery list.
 */
export function OutOfStock() {
  const items = useItems('pantry');
  const categories = useCategories();
  const stores = useStores();
  const grocery = useGrocery();
  const settings = useSettings();
  const toast = useToast();

  const [scope, setScope] = useState<Scope>('out');
  const [storeFilter, setStoreFilter] = useState('');

  const cats = byId(categories);
  const strs = byId(stores);

  const onList = useMemo(
    () => new Set(grocery.filter((g) => g.itemId).map((g) => g.itemId as string)),
    [grocery],
  );

  const rows = useMemo(() => {
    return items
      .filter((i) => {
        const s = stockStatus(i);
        if (scope === 'out' ? s !== 'out' : s === 'in') return false;
        if (storeFilter && i.storeId !== storeFilter) return false;
        return true;
      })
      .sort((a, b) => {
        // Grouped by store, matching the "Sort by - STORE" note.
        const sa = strs.get(a.storeId ?? '')?.sortOrder ?? 999;
        const sb = strs.get(b.storeId ?? '')?.sortOrder ?? 999;
        if (sa !== sb) return sa - sb;
        return a.name.localeCompare(b.name);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, scope, storeFilter, stores]);

  const outValue = outOfStockValue(items);
  const scopeValue = rows.reduce((sum, i) => sum + (i.price ?? 0) * restockQty(i), 0);
  const outCount = items.filter((i) => stockStatus(i) === 'out').length;
  const lowCount = items.filter((i) => stockStatus(i) === 'low').length;

  const addAll = async () => {
    let n = 0;
    for (const item of rows) {
      if (!onList.has(item.id)) {
        await addItemToGrocery(item);
        n++;
      }
    }
    toast(n ? `Added ${n} items to the grocery list.` : 'Everything is already on the list.', 'ok');
  };

  const restock = async (item: Item) => {
    const target = item.restockTo ?? item.lowThreshold + 1;
    await db.items.update(item.id, {
      qty: round2(Math.max(target, item.lowThreshold + 1)),
      updatedAt: now(),
      lastCountedAt: now(),
    });
    await syncAutoGrocery();
    toast(`${item.name} marked back in stock.`, 'ok');
  };

  // Group rows by store for display headings.
  const grouped = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const r of rows) {
      const key = r.storeId ?? '';
      const list = map.get(key);
      if (list) list.push(r);
      else map.set(key, [r]);
    }
    return [...map.entries()];
  }, [rows]);

  return (
    <Page
      title="Out of Stock"
      subtitle={`${outCount} out · ${lowCount} running low`}
      actions={
        <button className="btn btn-primary btn-sm" onClick={addAll} disabled={rows.length === 0}>
          <ShoppingCart size={15} />
          Add all to list
        </button>
      }
    >
      <div className="stat-grid">
        <Stat
          label="Out of stock value"
          value={money(outValue, settings.locale, settings.currency)}
          hint="Cost to replace everything at zero"
          tone={outValue > 0 ? 'danger' : undefined}
        />
        <Stat label="Items out" value={outCount} tone={outCount ? 'danger' : 'ok'} />
        <Stat label="Items low" value={lowCount} tone={lowCount ? 'warn' : 'ok'} />
        <Stat
          label="Showing"
          value={money(scopeValue, settings.locale, settings.currency)}
          hint={`${rows.length} lines in view`}
        />
      </div>

      <div className="card">
        <div className="card-head">
          <SegmentedControl<Scope>
            value={scope}
            onChange={setScope}
            options={[
              { value: 'out', label: `Out (${outCount})` },
              { value: 'lowAndOut', label: `Low + out (${outCount + lowCount})` },
            ]}
          />
          <select
            className="select"
            style={{ width: 'auto' }}
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
          >
            <option value="">All stores</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="card-body flush">
          {rows.length === 0 ? (
            <EmptyState
              icon={<PackageCheck size={22} />}
              title="Nothing is out of stock"
              message={
                <>
                  Items land here the moment their quantity hits zero. Keep the pantry counts up to
                  date and this page stays empty. <Link to="/pantry">Go to the pantry</Link>
                </>
              }
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th className="col-tight" title="Add to grocery list">
                      Add
                    </th>
                    <th className="col-num" style={{ width: 70 }}>
                      Qty
                    </th>
                    <th>Item / Food</th>
                    <th className="col-num" style={{ width: 100 }}>
                      Price
                    </th>
                    <th style={{ width: 170 }}>Category</th>
                    <th style={{ width: 110 }}>Status</th>
                    <th className="col-tight no-print" />
                  </tr>
                </thead>
                <tbody>
                  {grouped.map(([storeId, list]) => (
                    <Fragment key={storeId || 'none'}>
                      <tr className="group-row">
                        <td colSpan={7}>
                          <div className="row-between">
                            <span>{strs.get(storeId)?.name ?? 'No store set'} · {list.length}</span>
                            <span className="num">
                              {money(
                                list.reduce((s, i) => s + (i.price ?? 0) * restockQty(i), 0),
                                settings.locale,
                                settings.currency,
                              )}
                            </span>
                          </div>
                        </td>
                      </tr>
                      {list.map((item) => {
                        const status = stockStatus(item);
                        return (
                          <tr key={item.id}>
                            <td className="col-tight">
                              <input
                                type="checkbox"
                                className="checkbox"
                                checked={onList.has(item.id)}
                                onChange={async (e) => {
                                  if (e.target.checked) {
                                    await addItemToGrocery(item);
                                  } else {
                                    const rows = await db.grocery
                                      .where('itemId')
                                      .equals(item.id)
                                      .toArray();
                                    await db.grocery.bulkDelete(rows.map((r) => r.id));
                                  }
                                }}
                                aria-label={`Add ${item.name} to grocery list`}
                              />
                            </td>
                            <td className="col-num strong">{item.qty}</td>
                            <td>
                              <span className="item-name">{item.name}</span>
                              <span className="tiny faint">
                                {' '}
                                buy {restockQty(item)} {item.unit !== 'ea' ? item.unit : ''}
                              </span>
                            </td>
                            <td className="col-num">
                              {item.price == null
                                ? '--'
                                : money(
                                    item.price * restockQty(item),
                                    settings.locale,
                                    settings.currency,
                                  )}
                            </td>
                            <td className="small">
                              <CategoryTag category={cats.get(item.categoryId)} />
                            </td>
                            <td>
                              <Badge tone={status === 'out' ? 'danger' : 'warn'}>
                                {status === 'out' ? 'Out' : 'Low'}
                              </Badge>
                            </td>
                            <td className="col-tight no-print">
                              <button
                                className="btn btn-sm btn-ghost"
                                onClick={() => restock(item)}
                                title="Mark back in stock without going through the list"
                              >
                                <Plus size={14} />
                                Restock
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="small muted">
          <PackageX size={13} style={{ verticalAlign: -2 }} /> Replacement cost assumes you buy back
          up to each item's restock target at its last known price.
        </div>
      )}
    </Page>
  );
}
