import { useState } from 'react';
import { ChefHat, Minus, Pencil, Plus, Trash2 } from 'lucide-react';
import { Page } from '@/components/Layout';
import { Badge, ConfirmDialog, EmptyState, SearchInput, Stat, useFilterText, useToast } from '@/components/ui';
import { ItemForm } from '@/components/ItemForm';
import { db, now } from '@/db/schema';
import { byId, useItems, useLocations, useSettings } from '@/hooks/useData';
import { EXPIRY_TONE, daysLeftLabel, expiryStatus, round2, stockStatus } from '@/domain/stock';
import { mediumDate } from '@/domain/format';
import type { Item } from '@/domain/types';

/**
 * "Section for home made goods -- eg. Pickles, Jams, Sauces" (notes, photo 02).
 *
 * Same underlying inventory row as the pantry, but presented around the batch:
 * when it was made, what went into it, and how long it keeps.
 */
export function HomeMade() {
  const items = useItems('homemade');
  const locations = useLocations();
  const settings = useSettings();
  const toast = useToast();

  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [deleting, setDeleting] = useState<Item | null>(null);

  const locs = byId(locations);
  const filtered = useFilterText(items, query, (i) => [i.name, i.recipe ?? '', i.notes ?? '']);

  const totalJars = items.reduce((s, i) => s + i.qty, 0);
  const expiringSoon = items.filter((i) => {
    const st = expiryStatus(i.expiry, settings.expiryWarnDays * 4);
    return st === 'soon' || st === 'expired';
  }).length;

  const adjust = async (item: Item, delta: number) => {
    await db.items.update(item.id, {
      qty: Math.max(0, round2(item.qty + delta)),
      updatedAt: now(),
    });
  };

  return (
    <Page
      title="Home Made"
      subtitle="Pickles, jams, sauces and anything else out of your own kitchen"
      actions={
        <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
          <Plus size={15} />
          New batch
        </button>
      }
    >
      <div className="stat-grid">
        <Stat label="Batches" value={items.length} />
        <Stat label="Jars / units on hand" value={round2(totalJars)} />
        <Stat
          label="Use up soon"
          value={expiringSoon}
          tone={expiringSoon ? 'warn' : 'ok'}
          hint={`Within ${settings.expiryWarnDays * 4} days`}
        />
        <Stat label="Out" value={items.filter((i) => stockStatus(i) === 'out').length} />
      </div>

      <div className="card">
        <div className="card-head">
          <SearchInput value={query} onChange={setQuery} placeholder="Search batches or recipes..." />
        </div>

        <div className="card-body flush">
          {filtered.length === 0 ? (
            <EmptyState
              icon={<ChefHat size={22} />}
              title={items.length ? 'Nothing matches' : 'No home made goods yet'}
              message={
                items.length
                  ? 'Try a different search.'
                  : 'Record a batch of pickles, jam or sauce with the date you made it and how long it keeps.'
              }
              action={
                !items.length && (
                  <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
                    <Plus size={15} /> New batch
                  </button>
                )
              }
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th className="col-num" style={{ width: 120 }}>
                      On hand
                    </th>
                    <th>Batch</th>
                    <th style={{ width: 140 }}>Made on</th>
                    <th style={{ width: 140 }}>Location</th>
                    <th style={{ width: 130 }}>Best before</th>
                    <th style={{ width: 130 }}>Keeps for</th>
                    <th className="col-tight no-print" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => {
                    const exp = expiryStatus(item.expiry, settings.expiryWarnDays * 4);
                    return (
                      <tr key={item.id} data-expired={exp === 'expired'}>
                        <td className="col-num">
                          <div className="row" style={{ justifyContent: 'flex-end', gap: 2 }}>
                            <button
                              className="btn btn-ghost btn-icon no-print"
                              style={{ padding: 3 }}
                              onClick={() => adjust(item, -1)}
                              aria-label={`Use one ${item.name}`}
                            >
                              <Minus size={13} />
                            </button>
                            <span className="strong">
                              {item.qty} <span className="tiny faint">{item.unit}</span>
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
                          {item.recipe && (
                            <div className="tiny faint truncate" style={{ maxWidth: 340 }}>
                              {item.recipe}
                            </div>
                          )}
                        </td>
                        <td className="small">{mediumDate(item.batchDate, settings.locale)}</td>
                        <td className="small muted">{locs.get(item.locationId)?.name ?? '--'}</td>
                        <td className="small">{mediumDate(item.expiry, settings.locale)}</td>
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
          kind="homemade"
          item={editing ?? undefined}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete batch"
          message={
            <>
              Delete <strong>{deleting.name}</strong>?
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
