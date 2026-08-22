import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, Minus, Package, Pencil, Plus, Trash2 } from 'lucide-react';
import { Page } from '@/components/Layout';
import { Icon } from '@/components/icons';
import {
  Badge,
  ConfirmDialog,
  EmptyState,
  SearchInput,
  SegmentedControl,
  SortHeader,
  sortRows,
  useFilterText,
  useSort,
  useToast,
} from '@/components/ui';
import { ItemForm } from '@/components/ItemForm';
import { db, now } from '@/db/schema';
import {
  byId,
  useCategories,
  useGrocery,
  useItems,
  useLocations,
  useSettings,
  useStores,
} from '@/hooks/useData';
import type { Item, StockStatus } from '@/domain/types';
import {
  STOCK_LABEL,
  STOCK_TONE,
  daysLeft,
  daysLeftLabel,
  expiryStatus,
  round2,
  stockStatus,
  toISODate,
} from '@/domain/stock';
import { addItemToGrocery, removeItemFromGrocery, syncAutoGrocery } from '@/domain/grocery';
import { mediumDate, money, shortDate } from '@/domain/format';

type SortKey =
  | 'name'
  | 'qty'
  | 'category'
  | 'location'
  | 'price'
  | 'store'
  | 'stock'
  | 'expiry';

type StockFilter = 'all' | 'in' | 'low' | 'out' | 'expiring';

const STOCK_RANK: Record<StockStatus, number> = { out: 0, low: 1, in: 2 };

export function Pantry() {
  const items = useItems('pantry');
  const categories = useCategories();
  const locations = useLocations();
  const stores = useStores();
  const settings = useSettings();
  const toast = useToast();

  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [editing, setEditing] = useState<Item | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Item | null>(null);
  const { sort, toggle } = useSort<SortKey>('name');

  const cats = byId(categories);
  const locs = byId(locations);
  const strs = byId(stores);

  const searched = useFilterText(items, query, (i) => [
    i.name,
    cats.get(i.categoryId)?.name ?? '',
    locs.get(i.locationId)?.name ?? '',
    i.notes ?? '',
  ]);

  const filtered = useMemo(() => {
    return searched.filter((i) => {
      if (categoryId && i.categoryId !== categoryId) return false;
      if (locationId && i.locationId !== locationId) return false;
      if (stockFilter === 'expiring') {
        const st = expiryStatus(i.expiry, settings.expiryWarnDays);
        return st === 'soon' || st === 'expired';
      }
      if (stockFilter !== 'all' && stockStatus(i) !== stockFilter) return false;
      return true;
    });
  }, [searched, categoryId, locationId, stockFilter, settings.expiryWarnDays]);

  const sorted = useMemo(
    () =>
      sortRows<Item, SortKey>(filtered, sort, {
        name: (i) => i.name.toLowerCase(),
        qty: (i) => i.qty,
        category: (i) => cats.get(i.categoryId)?.sortOrder ?? 999,
        location: (i) => locs.get(i.locationId)?.sortOrder ?? 999,
        price: (i) => i.price ?? null,
        store: (i) => strs.get(i.storeId ?? '')?.name ?? null,
        stock: (i) => STOCK_RANK[stockStatus(i)],
        expiry: (i) => daysLeft(i.expiry),
      }),
    // Lookup maps are rebuilt each render but are cheap and stable in content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, sort],
  );

  const counts = useMemo(() => {
    let low = 0;
    let out = 0;
    let expired = 0;
    let value = 0;
    for (const i of items) {
      const s = stockStatus(i);
      if (s === 'low') low++;
      if (s === 'out') out++;
      if (expiryStatus(i.expiry, settings.expiryWarnDays) === 'expired') expired++;
      value += (i.price ?? 0) * i.qty;
    }
    return { low, out, expired, value };
  }, [items, settings.expiryWarnDays]);

  const adjustQty = async (item: Item, delta: number) => {
    const qty = Math.max(0, round2(item.qty + delta));
    await db.items.update(item.id, { qty, updatedAt: now(), lastCountedAt: now() });
    await syncAutoGrocery();
  };

  const toggleOnList = async (item: Item, checked: boolean) => {
    if (checked) {
      await addItemToGrocery(item);
      toast(`${item.name} added to the grocery list.`, 'ok');
    } else {
      await removeItemFromGrocery(item.id);
    }
  };

  const markInventoryDone = async () => {
    await db.settings.update('settings', { lastInventoryDate: toISODate(new Date()) });
    toast('Stocktake date updated.', 'ok');
  };

  const onList = useOnListIds();

  return (
    <Page
      title="Pantry"
      subtitle={
        <>
          Last inventory:{' '}
          <strong>{mediumDate(settings.lastInventoryDate, settings.locale)}</strong>
          {' · '}
          {items.length} items · {money(counts.value, settings.locale, settings.currency)} on hand
        </>
      }
      actions={
        <>
          <button className="btn btn-sm" onClick={markInventoryDone} title="Record a stocktake today">
            <CalendarCheck size={15} />
            Stocktake done
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
            <Plus size={15} />
            Add item
          </button>
        </>
      }
    >
      <div className="card">
        <div className="card-head" style={{ flexWrap: 'wrap' }}>
          <SearchInput value={query} onChange={setQuery} placeholder="Search items, categories..." />

          <div className="toolbar">
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

            <SegmentedControl<StockFilter>
              value={stockFilter}
              onChange={setStockFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'in', label: 'In' },
                { value: 'low', label: `Low${counts.low ? ` ${counts.low}` : ''}` },
                { value: 'out', label: `Out${counts.out ? ` ${counts.out}` : ''}` },
                { value: 'expiring', label: 'Expiring' },
              ]}
            />
          </div>
        </div>

        <div className="card-body flush">
          {sorted.length === 0 ? (
            <EmptyState
              icon={<Package size={22} />}
              title={items.length ? 'Nothing matches those filters' : 'Your pantry is empty'}
              message={
                items.length
                  ? 'Try clearing the search or the category filter.'
                  : 'Add your first item, or load the demo data from Settings to see how it all fits together.'
              }
              action={
                !items.length && (
                  <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
                    <Plus size={15} /> Add item
                  </button>
                )
              }
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th className="col-tight" title="Add to grocery list">
                      <span className="sr-only">On list</span>
                      +
                    </th>
                    <SortHeader label="Qty" sortKey="qty" sort={sort} onSort={toggle} align="right" />
                    <th style={{ width: 60 }}>Unit</th>
                    <SortHeader label="Item / Food" sortKey="name" sort={sort} onSort={toggle} />
                    <SortHeader label="Category" sortKey="category" sort={sort} onSort={toggle} />
                    <SortHeader label="Location" sortKey="location" sort={sort} onSort={toggle} />
                    <SortHeader label="Price" sortKey="price" sort={sort} onSort={toggle} align="right" />
                    <SortHeader label="Store" sortKey="store" sort={sort} onSort={toggle} />
                    <SortHeader label="Stock" sortKey="stock" sort={sort} onSort={toggle} />
                    <SortHeader label="Expiry" sortKey="expiry" sort={sort} onSort={toggle} />
                    <th>Days left</th>
                    <th className="col-tight" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((item) => {
                    const status = stockStatus(item);
                    const exp = expiryStatus(item.expiry, settings.expiryWarnDays);
                    const cat = cats.get(item.categoryId);
                    return (
                      <tr key={item.id} data-expired={exp === 'expired'}>
                        <td className="col-tight">
                          <input
                            type="checkbox"
                            className="checkbox"
                            checked={onList.has(item.id)}
                            onChange={(e) => toggleOnList(item, e.target.checked)}
                            aria-label={`Add ${item.name} to grocery list`}
                          />
                        </td>

                        <td className="col-num">
                          <div className="row" style={{ justifyContent: 'flex-end', gap: 2 }}>
                            <button
                              className="btn btn-ghost btn-icon no-print"
                              style={{ padding: 3 }}
                              onClick={() => adjustQty(item, -1)}
                              aria-label={`Decrease ${item.name}`}
                            >
                              <Minus size={13} />
                            </button>
                            <span className="strong" style={{ minWidth: 26, textAlign: 'right' }}>
                              {item.qty}
                            </span>
                            <button
                              className="btn btn-ghost btn-icon no-print"
                              style={{ padding: 3 }}
                              onClick={() => adjustQty(item, 1)}
                              aria-label={`Increase ${item.name}`}
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                        </td>

                        <td className="muted small">{item.unit}</td>

                        <td>
                          <span className="item-name">{item.name}</span>
                          {item.notes && (
                            <div className="tiny faint truncate" style={{ maxWidth: 220 }}>
                              {item.notes}
                            </div>
                          )}
                        </td>

                        <td className="small">
                          <span className="row" style={{ gap: 6 }}>
                            <Icon name={cat?.icon} size={14} />
                            {cat?.name ?? '--'}
                          </span>
                        </td>

                        <td className="small muted">{locs.get(item.locationId)?.name ?? '--'}</td>

                        <td className="col-num">
                          {item.price == null
                            ? '--'
                            : money(item.price, settings.locale, settings.currency)}
                        </td>

                        <td className="small muted truncate">
                          {strs.get(item.storeId ?? '')?.name ?? '--'}
                        </td>

                        <td>
                          <Badge tone={STOCK_TONE[status]}>{STOCK_LABEL[status]}</Badge>
                        </td>

                        <td className="small nowrap">{shortDate(item.expiry, settings.locale)}</td>

                        <td className="small nowrap">
                          {exp === 'none' ? (
                            <span className="faint">--</span>
                          ) : (
                            <span
                              style={{
                                color:
                                  exp === 'expired'
                                    ? 'var(--danger)'
                                    : exp === 'soon'
                                      ? 'var(--warn)'
                                      : undefined,
                                fontWeight: exp === 'ok' ? undefined : 600,
                              }}
                            >
                              {exp === 'expired' ? 'Expired' : daysLeftLabel(item.expiry)}
                            </span>
                          )}
                        </td>

                        <td className="col-tight no-print">
                          <div className="row" style={{ gap: 2 }}>
                            <button
                              className="btn btn-ghost btn-icon"
                              onClick={() => setEditing(item)}
                              aria-label={`Edit ${item.name}`}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              className="btn btn-ghost btn-icon"
                              onClick={() => setDeleting(item)}
                              aria-label={`Delete ${item.name}`}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {counts.expired > 0 && (
        <div className="small muted">
          {counts.expired} item{counts.expired === 1 ? '' : 's'} past their expiry date are
          highlighted in red. <Link to="/print">Print a stocktake sheet</Link> to walk the pantry
          and check them off.
        </div>
      )}

      {(creating || editing) && (
        <ItemForm
          kind="pantry"
          item={editing ?? undefined}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete item"
          message={
            <>
              Delete <strong>{deleting.name}</strong> from the pantry? Its price history is kept.
            </>
          }
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await db.items.delete(deleting.id);
            await removeItemFromGrocery(deleting.id);
            await syncAutoGrocery();
            toast(`Deleted ${deleting.name}.`);
          }}
        />
      )}
    </Page>
  );
}

/** Ids of pantry items that currently have a grocery line. */
function useOnListIds(): Set<string> {
  const grocery = useGrocery();
  return useMemo(
    () => new Set(grocery.filter((g) => g.itemId).map((g) => g.itemId as string)),
    [grocery],
  );
}
