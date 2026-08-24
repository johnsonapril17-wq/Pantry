import { useMemo, useState } from 'react';
import { Check, Plus, RefreshCw, ShoppingCart, Sparkles, Trash2, Undo2 } from 'lucide-react';
import { CategoryTag } from '@/components/CategoryTag';
import { Page } from '@/components/Layout';
import {
  Badge,
  ConfirmDialog,
  EmptyState,
  Field,
  Modal,
  SegmentedControl,
  Stat,
  useToast,
} from '@/components/ui';
import { UNITS } from '@/components/ItemForm';
import { db, now, uid } from '@/db/schema';
import { byId, useCategories, useGrocery, useItems, useSettings, useStores } from '@/hooks/useData';
import { groupByStore, listTotal, syncAutoGrocery } from '@/domain/grocery';
import { money, toISODate } from '@/domain/format';
import { round2 } from '@/domain/stock';
import type { GroceryEntry } from '@/domain/types';

type View = 'todo' | 'all';

export function GroceryList() {
  const entries = useGrocery();
  const stores = useStores();
  const categories = useCategories();
  const items = useItems('pantry');
  const settings = useSettings();
  const toast = useToast();

  const [view, setView] = useState<View>('todo');
  const [adding, setAdding] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  const visible = view === 'todo' ? entries.filter((e) => !e.checked) : entries;
  const groups = useMemo(
    () => groupByStore(visible, stores, categories),
    [visible, stores, categories],
  );

  const cats = byId(categories);
  const total = listTotal(entries);
  const remaining = listTotal(entries, true);
  const checkedCount = entries.filter((e) => e.checked).length;
  const autoCount = entries.filter((e) => e.source === 'auto').length;

  const setChecked = async (entry: GroceryEntry, checked: boolean) => {
    await db.grocery.update(entry.id, {
      checked,
      checkedAt: checked ? now() : undefined,
    });
  };

  const setQty = async (entry: GroceryEntry, qty: number) => {
    await db.grocery.update(entry.id, { qty: Math.max(0, round2(qty)) });
  };

  const remove = async (entry: GroceryEntry) => {
    await db.grocery.delete(entry.id);
  };

  const resync = async () => {
    const { added, removed } = await syncAutoGrocery();
    toast(
      added || removed
        ? `Synced: ${added} added, ${removed} removed.`
        : 'List already up to date.',
      'ok',
    );
  };

  return (
    <Page
      title="Grocery List"
      subtitle={`${entries.filter((e) => !e.checked).length} to buy · sorted by store, then aisle`}
      actions={
        <>
          <button className="btn btn-sm" onClick={resync} title="Re-check low and out-of-stock items">
            <RefreshCw size={15} />
            Sync
          </button>
          <button className="btn btn-sm" onClick={() => setAdding(true)}>
            <Plus size={15} />
            Add line
          </button>
          <button
            className="btn btn-primary btn-sm"
            disabled={checkedCount === 0}
            onClick={() => setCheckingOut(true)}
            title="Move ticked items into the pantry and log the spend"
          >
            <Check size={15} />
            Check out ({checkedCount})
          </button>
        </>
      }
    >
      <div className="stat-grid">
        <Stat
          label="Estimated cost"
          value={money(total, settings.locale, settings.currency)}
          hint="Whole list at last known prices"
        />
        <Stat
          label="Still to buy"
          value={money(remaining, settings.locale, settings.currency)}
          hint={`${entries.filter((e) => !e.checked).length} lines`}
        />
        <Stat
          label="Auto-added"
          value={autoCount}
          hint="From low / out of stock"
          icon={<Sparkles size={13} />}
        />
        <Stat
          label="Weekly budget"
          value={money(settings.weeklyBudget, settings.locale, settings.currency)}
          tone={remaining > settings.weeklyBudget ? 'danger' : undefined}
          hint={
            remaining > settings.weeklyBudget
              ? `Over by ${money(remaining - settings.weeklyBudget, settings.locale, settings.currency)}`
              : `${money(settings.weeklyBudget - remaining, settings.locale, settings.currency)} headroom`
          }
        />
      </div>

      <div className="card">
        <div className="card-head">
          <SegmentedControl<View>
            value={view}
            onChange={setView}
            options={[
              { value: 'todo', label: 'To buy' },
              { value: 'all', label: `All (${entries.length})` },
            ]}
          />
          <div className="toolbar">
            {checkedCount > 0 && (
              <button
                className="btn btn-sm btn-ghost"
                onClick={async () => {
                  const ids = entries.filter((e) => e.checked).map((e) => e.id);
                  await db.grocery.bulkUpdate(
                    ids.map((id) => ({ key: id, changes: { checked: false } })),
                  );
                }}
              >
                <Undo2 size={14} />
                Untick all
              </button>
            )}
            <button
              className="btn btn-sm btn-ghost"
              disabled={entries.length === 0}
              onClick={() => setConfirmClear(true)}
            >
              <Trash2 size={14} />
              Clear list
            </button>
          </div>
        </div>

        <div className="card-body flush">
          {groups.length === 0 ? (
            <EmptyState
              icon={<ShoppingCart size={22} />}
              title={view === 'todo' && entries.length ? 'Everything is ticked off' : 'Nothing to buy'}
              message={
                entries.length
                  ? 'Switch to "All" to see what you have already picked up.'
                  : 'Items are added here automatically when they run low or out. You can also add a line by hand.'
              }
              action={
                <button className="btn btn-sm" onClick={() => setAdding(true)}>
                  <Plus size={15} /> Add line
                </button>
              }
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th className="col-tight" />
                    <th className="col-num" style={{ width: 90 }}>
                      Qty
                    </th>
                    <th>Item / Food</th>
                    <th className="col-num" style={{ width: 90 }}>
                      Price
                    </th>
                    <th style={{ width: 170 }}>Category</th>
                    <th style={{ width: 90 }}>Source</th>
                    <th className="col-tight" />
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => (
                    <GroupRows
                      key={group.storeId ?? 'none'}
                      title={group.storeName}
                      subtotal={money(group.subtotal, settings.locale, settings.currency)}
                      count={group.entries.length}
                    >
                      {group.entries.map((e) => (
                        <tr key={e.id} data-checked={e.checked}>
                          <td className="col-tight">
                            <input
                              type="checkbox"
                              className="checkbox"
                              checked={e.checked}
                              onChange={(ev) => setChecked(e, ev.target.checked)}
                              aria-label={`Tick off ${e.name}`}
                            />
                          </td>
                          <td className="col-num">
                            <input
                              className="input"
                              type="number"
                              min="0"
                              step="any"
                              value={e.qty}
                              onChange={(ev) => setQty(e, Number(ev.target.value))}
                              style={{ width: 70, padding: '3px 6px', textAlign: 'right' }}
                              aria-label={`Quantity of ${e.name}`}
                            />
                          </td>
                          <td>
                            <span className="item-name">{e.name}</span>
                            <span className="tiny faint"> {e.unit !== 'ea' ? e.unit : ''}</span>
                            {e.note && <div className="tiny faint">{e.note}</div>}
                          </td>
                          <td className="col-num">
                            {e.price == null
                              ? '--'
                              : money(e.price * e.qty, settings.locale, settings.currency)}
                          </td>
                          <td className="small">
                            <CategoryTag category={cats.get(e.categoryId)} />
                          </td>
                          <td>
                            <Badge tone={e.source === 'auto' ? 'accent' : 'neutral'}>
                              {e.source === 'auto' ? 'Auto' : 'Manual'}
                            </Badge>
                          </td>
                          <td className="col-tight no-print">
                            <button
                              className="btn btn-ghost btn-icon"
                              onClick={() => remove(e)}
                              aria-label={`Remove ${e.name}`}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </GroupRows>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {adding && <AddLineModal onClose={() => setAdding(false)} />}

      {checkingOut && (
        <CheckoutModal
          entries={entries.filter((e) => e.checked)}
          onClose={() => setCheckingOut(false)}
        />
      )}

      {confirmClear && (
        <ConfirmDialog
          title="Clear the list"
          message="Remove every line, including ones added automatically? Items that are still low or out will come back the next time the list syncs."
          confirmLabel="Clear"
          onClose={() => setConfirmClear(false)}
          onConfirm={async () => {
            await db.grocery.clear();
            toast('Grocery list cleared.');
          }}
        />
      )}

      <div className="small muted">
        Lines marked <strong>Auto</strong> appear because the item is low or out of stock, and
        disappear once it is restocked. Lines you add by hand stay until you remove them.{' '}
        {items.length === 0 && 'Add pantry items to see this working.'}
      </div>
    </Page>
  );
}

/** A store heading row plus its lines. */
function GroupRows({
  title,
  subtotal,
  count,
  children,
}: {
  title: string;
  subtotal: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <>
      <tr className="group-row">
        <td colSpan={7}>
          <div className="row-between">
            <span>
              {title} · {count}
            </span>
            <span className="num">{subtotal}</span>
          </div>
        </td>
      </tr>
      {children}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Add an ad-hoc line                                                          */
/* -------------------------------------------------------------------------- */

function AddLineModal({ onClose }: { onClose: () => void }) {
  const categories = useCategories();
  const stores = useStores();
  const toast = useToast();

  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);
  const [unit, setUnit] = useState('ea');
  const [price, setPrice] = useState<string>('');
  const [categoryId, setCategoryId] = useState('');
  const [storeId, setStoreId] = useState('');

  const save = async () => {
    if (!name.trim()) {
      toast('Give the line a name.', 'danger');
      return;
    }
    await db.grocery.add({
      id: uid(),
      name: name.trim(),
      qty,
      unit,
      price: price === '' ? undefined : Number(price),
      categoryId: categoryId || categories[0]?.id || '',
      storeId: storeId || undefined,
      source: 'manual',
      checked: false,
      addedAt: now(),
    });
    toast(`Added ${name.trim()} to the list.`, 'ok');
    onClose();
  };

  return (
    <Modal
      title="Add to grocery list"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save}>
            Add line
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Item / Food" span>
          <input
            className="input"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            placeholder="e.g. Sourdough loaf"
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
        <Field label="Price each">
          <input
            className="input"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </Field>
        <Field label="Category">
          <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Store" span>
          <select className="select" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            <option value="">Any store</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Checkout: the moment shopping becomes inventory, spend and price history     */
/* -------------------------------------------------------------------------- */

function CheckoutModal({ entries, onClose }: { entries: GroceryEntry[]; onClose: () => void }) {
  const stores = useStores();
  const settings = useSettings();
  const toast = useToast();

  const [date, setDate] = useState(toISODate(new Date()));
  const [storeId, setStoreId] = useState(entries[0]?.storeId ?? '');
  const [logSpend, setLogSpend] = useState(true);

  const estimated = listTotal(entries);
  const [actual, setActual] = useState(estimated ? estimated.toFixed(2) : '');

  const confirm = async () => {
    const stamp = now();
    const amount = actual === '' ? estimated : Number(actual);

    await db.transaction(
      'rw',
      [db.items, db.grocery, db.priceEntries, db.spends, db.settings],
      async () => {
        for (const e of entries) {
          // Put it into the pantry.
          if (e.itemId) {
            const item = await db.items.get(e.itemId);
            if (item) {
              await db.items.update(item.id, {
                qty: round2(item.qty + e.qty),
                price: e.price ?? item.price,
                storeId: storeId || item.storeId,
                updatedAt: stamp,
                lastCountedAt: stamp,
              });
            }
          }

          // Record what it cost, where -- this is the price tracker's input.
          if (e.price != null) {
            await db.priceEntries.add({
              id: uid(),
              itemId: e.itemId,
              name: e.name,
              price: e.price,
              qty: e.qty,
              unit: e.unit,
              storeId: storeId || e.storeId,
              date,
            });
          }

          await db.grocery.delete(e.id);
        }

        if (logSpend && amount > 0) {
          await db.spends.add({
            id: uid(),
            date,
            amount,
            storeId: storeId || undefined,
            note: `Shop · ${entries.length} items`,
            createdAt: stamp,
          });
        }
      },
    );

    await syncAutoGrocery();
    toast(`${entries.length} items moved into the pantry.`, 'ok');
    onClose();
  };

  return (
    <Modal
      title="Check out"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={confirm}>
            Add {entries.length} to pantry
          </button>
        </>
      }
    >
      <p className="small muted">
        Ticked items are added to your pantry quantities. Their prices are logged against the store
        below so the price tracker can follow them over time.
      </p>

      <div className="form-grid">
        <Field label="Date">
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
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
        <Field
          label="Amount spent"
          span
          hint={`Estimated from list prices: ${money(estimated, settings.locale, settings.currency)}`}
        >
          <input
            className="input"
            type="number"
            min="0"
            step="0.01"
            value={actual}
            onChange={(e) => setActual(e.target.value)}
          />
        </Field>
      </div>

      <hr className="divider" />

      <label className="row" style={{ cursor: 'pointer' }}>
        <input
          type="checkbox"
          className="checkbox"
          checked={logSpend}
          onChange={(e) => setLogSpend(e.target.checked)}
        />
        <span className="small">Log this against the weekly and monthly budget</span>
      </label>
    </Modal>
  );
}
