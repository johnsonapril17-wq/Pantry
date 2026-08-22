import { useMemo, useState } from 'react';
import { Minus, Pencil, Plus, Snowflake, Soup, Trash2, UtensilsCrossed } from 'lucide-react';
import { Page } from '@/components/Layout';
import {
  Badge,
  ConfirmDialog,
  EmptyState,
  SearchInput,
  Stat,
  useFilterText,
  useToast,
} from '@/components/ui';
import { ItemForm } from '@/components/ItemForm';
import { db, now } from '@/db/schema';
import { byId, useItems, useLocations, useSettings } from '@/hooks/useData';
import { EXPIRY_TONE, daysLeftLabel, expiryStatus, round2 } from '@/domain/stock';
import { mediumDate, pluralise } from '@/domain/format';
import type { Item } from '@/domain/types';

/**
 * "Freezer meals - food prepped? Meal prep section" (notes, photo 02).
 *
 * The number that matters here is portions, not containers -- three containers
 * of two servings is six dinners, and that is what tells you whether the
 * freezer is actually carrying you through the week.
 */
export function MealPrep() {
  const items = useItems('mealprep');
  const locations = useLocations();
  const settings = useSettings();
  const toast = useToast();

  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [deleting, setDeleting] = useState<Item | null>(null);

  const locs = byId(locations);
  const filtered = useFilterText(items, query, (i) => [i.name, i.notes ?? '']);

  const totals = useMemo(() => {
    let containers = 0;
    let portions = 0;
    let expired = 0;
    for (const i of items) {
      containers += i.qty;
      portions += i.qty * (i.portions ?? 1);
      if (expiryStatus(i.expiry, settings.expiryWarnDays) === 'expired') expired++;
    }
    return { containers: round2(containers), portions: round2(portions), expired };
  }, [items, settings.expiryWarnDays]);

  const adjust = async (item: Item, delta: number) => {
    await db.items.update(item.id, {
      qty: Math.max(0, round2(item.qty + delta)),
      updatedAt: now(),
    });
  };

  return (
    <Page
      title="Meal Prep"
      subtitle="Freezer meals and prepped food, counted in portions"
      actions={
        <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
          <Plus size={15} />
          Add meal
        </button>
      }
    >
      <div className="stat-grid">
        <Stat
          label="Portions ready"
          value={totals.portions}
          hint={`Across ${pluralise(items.length, 'meal')}`}
          icon={<UtensilsCrossed size={13} />}
          tone={totals.portions === 0 ? 'warn' : 'ok'}
        />
        <Stat label="Containers" value={totals.containers} icon={<Snowflake size={13} />} />
        <Stat
          label="Past use-by"
          value={totals.expired}
          tone={totals.expired ? 'danger' : 'ok'}
        />
        <Stat
          label="Dinners covered"
          value={Math.floor(totals.portions / 2)}
          hint="Assuming 2 portions per dinner"
        />
      </div>

      <div className="card">
        <div className="card-head">
          <SearchInput value={query} onChange={setQuery} placeholder="Search meals..." />
        </div>

        <div className="card-body flush">
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Soup size={22} />}
              title={items.length ? 'Nothing matches' : 'No prepped meals recorded'}
              message={
                items.length
                  ? 'Try a different search.'
                  : 'Log what is in the freezer with how many portions each container holds, and this page tells you how many dinners you have banked.'
              }
              action={
                !items.length && (
                  <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
                    <Plus size={15} /> Add meal
                  </button>
                )
              }
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th className="col-num" style={{ width: 130 }}>
                      Containers
                    </th>
                    <th>Meal</th>
                    <th className="col-num" style={{ width: 90 }}>
                      Portions
                    </th>
                    <th className="col-num" style={{ width: 90 }}>
                      Total
                    </th>
                    <th style={{ width: 140 }}>Prepped</th>
                    <th style={{ width: 130 }}>Location</th>
                    <th style={{ width: 130 }}>Use by</th>
                    <th className="col-tight no-print" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => {
                    const exp = expiryStatus(item.expiry, settings.expiryWarnDays);
                    return (
                      <tr key={item.id} data-expired={exp === 'expired'}>
                        <td className="col-num">
                          <div className="row" style={{ justifyContent: 'flex-end', gap: 2 }}>
                            <button
                              className="btn btn-ghost btn-icon no-print"
                              style={{ padding: 3 }}
                              onClick={() => adjust(item, -1)}
                              aria-label={`Eat one ${item.name}`}
                            >
                              <Minus size={13} />
                            </button>
                            <span className="strong" style={{ minWidth: 22, textAlign: 'right' }}>
                              {item.qty}
                            </span>
                            <button
                              className="btn btn-ghost btn-icon no-print"
                              style={{ padding: 3 }}
                              onClick={() => adjust(item, 1)}
                              aria-label={`Add one ${item.name}`}
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                        </td>
                        <td>
                          <span className="item-name">{item.name}</span>
                          {item.notes && <div className="tiny faint truncate">{item.notes}</div>}
                        </td>
                        <td className="col-num muted">{item.portions ?? 1} ea</td>
                        <td className="col-num strong">{round2(item.qty * (item.portions ?? 1))}</td>
                        <td className="small">{mediumDate(item.batchDate, settings.locale)}</td>
                        <td className="small muted">{locs.get(item.locationId)?.name ?? '--'}</td>
                        <td>
                          {exp === 'none' ? (
                            <span className="faint small">--</span>
                          ) : (
                            <Badge tone={EXPIRY_TONE[exp]}>
                              {exp === 'expired' ? 'Past date' : daysLeftLabel(item.expiry)}
                            </Badge>
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

      {(creating || editing) && (
        <ItemForm
          kind="mealprep"
          item={editing ?? undefined}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete meal"
          message={
            <>
              Delete <strong>{deleting.name}</strong> from the freezer list?
            </>
          }
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await db.items.delete(deleting.id);
            toast(`Deleted ${deleting.name}.`);
          }}
        />
      )}
    </Page>
  );
}
