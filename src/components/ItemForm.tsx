import { useEffect, useState } from 'react';
import { db, now, uid } from '@/db/schema';
import type { Item, ItemKind } from '@/domain/types';
import { syncAutoGrocery } from '@/domain/grocery';
import { useCategories, useLocations, useStores } from '@/hooks/useData';
import { Field, Modal, useToast } from './ui';
import { toISODate } from '@/domain/stock';

/** Units offered in the dropdown. Free text is allowed too. */
export const UNITS = [
  'ea',
  'g',
  'kg',
  'ml',
  'L',
  'pkt',
  'can',
  'jar',
  'bag',
  'box',
  'bottle',
  'block',
  'tub',
  'bunch',
  'container',
  'loaf',
  'roll',
];

const KIND_TITLE: Record<ItemKind, string> = {
  pantry: 'pantry item',
  homemade: 'home made item',
  mealprep: 'prepped meal',
};

type Draft = Omit<Item, 'id' | 'createdAt' | 'updatedAt'>;

function blankDraft(kind: ItemKind, categoryId: string, locationId: string): Draft {
  return {
    kind,
    name: '',
    qty: 1,
    unit: kind === 'mealprep' ? 'container' : kind === 'homemade' ? 'jar' : 'ea',
    categoryId,
    locationId,
    storeId: undefined,
    price: undefined,
    lowThreshold: 1,
    restockTo: undefined,
    expiry: undefined,
    notes: '',
    batchDate: kind === 'pantry' ? undefined : toISODate(new Date()),
    portions: kind === 'mealprep' ? 2 : undefined,
  };
}

export function ItemForm({
  kind,
  item,
  onClose,
}: {
  kind: ItemKind;
  /** Absent means "create new". */
  item?: Item;
  onClose: () => void;
}) {
  const categories = useCategories();
  const locations = useLocations();
  const stores = useStores();
  const toast = useToast();

  const [draft, setDraft] = useState<Draft | null>(null);

  // Wait for reference data before building the blank draft, otherwise the
  // category/location dropdowns would default to an empty id.
  useEffect(() => {
    if (draft || !categories.length || !locations.length) return;
    setDraft(item ? { ...item } : blankDraft(kind, categories[0].id, locations[0].id));
  }, [item, kind, categories, locations, draft]);

  if (!draft) return null;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  const save = async () => {
    const name = draft.name.trim();
    if (!name) {
      toast('Give the item a name first.', 'danger');
      return;
    }

    const stamp = now();
    const payload = { ...draft, name };

    if (item) {
      await db.items.update(item.id, { ...payload, updatedAt: stamp });
    } else {
      await db.items.add({ ...payload, id: uid(), createdAt: stamp, updatedAt: stamp });
    }

    // Quantity may have crossed the low/out line either way.
    await syncAutoGrocery();
    toast(item ? `Updated ${name}.` : `Added ${name}.`, 'ok');
    onClose();
  };

  const isPantry = draft.kind === 'pantry';

  return (
    <Modal
      title={`${item ? 'Edit' : 'New'} ${KIND_TITLE[draft.kind]}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save}>
            {item ? 'Save changes' : 'Add item'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Item / Food" span>
          <input
            className="input"
            value={draft.name}
            autoFocus
            placeholder={isPantry ? 'e.g. Plain flour' : 'e.g. Bread & butter pickles'}
            onChange={(e) => set('name', e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
            }}
          />
        </Field>

        <Field label="Quantity">
          <input
            className="input"
            type="number"
            step="any"
            min="0"
            value={draft.qty}
            onChange={(e) => set('qty', Number(e.target.value))}
          />
        </Field>

        <Field label="Unit">
          <input
            className="input"
            list="unit-options"
            value={draft.unit}
            onChange={(e) => set('unit', e.target.value)}
          />
          <datalist id="unit-options">
            {UNITS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </Field>

        <Field label="Grocery Category">
          <select
            className="select"
            value={draft.categoryId}
            onChange={(e) => set('categoryId', e.target.value)}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Location">
          <select
            className="select"
            value={draft.locationId}
            onChange={(e) => set('locationId', e.target.value)}
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>

        {isPantry && (
          <>
            <Field label="Price" hint="Last price paid, per unit above.">
              <input
                className="input"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={draft.price ?? ''}
                onChange={(e) =>
                  set('price', e.target.value === '' ? undefined : Number(e.target.value))
                }
              />
            </Field>

            <Field label="Store">
              <select
                className="select"
                value={draft.storeId ?? ''}
                onChange={(e) => set('storeId', e.target.value || undefined)}
              >
                <option value="">Any store</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}

        <Field label="Low at or below" hint="Below this it joins the grocery list.">
          <input
            className="input"
            type="number"
            step="any"
            min="0"
            value={draft.lowThreshold}
            onChange={(e) => set('lowThreshold', Number(e.target.value))}
          />
        </Field>

        <Field label="Restock to" hint="Buy back up to this many.">
          <input
            className="input"
            type="number"
            step="any"
            min="0"
            placeholder={String(draft.lowThreshold + 1)}
            value={draft.restockTo ?? ''}
            onChange={(e) =>
              set('restockTo', e.target.value === '' ? undefined : Number(e.target.value))
            }
          />
        </Field>

        {draft.kind !== 'pantry' && (
          <Field label={draft.kind === 'homemade' ? 'Made on' : 'Prepped on'}>
            <input
              className="input"
              type="date"
              value={draft.batchDate ?? ''}
              onChange={(e) => set('batchDate', e.target.value || undefined)}
            />
          </Field>
        )}

        {draft.kind === 'mealprep' && (
          <Field label="Portions each">
            <input
              className="input"
              type="number"
              min="1"
              step="1"
              value={draft.portions ?? 1}
              onChange={(e) => set('portions', Number(e.target.value))}
            />
          </Field>
        )}

        <Field label={draft.kind === 'pantry' ? 'Expiry' : 'Use by'}>
          <input
            className="input"
            type="date"
            value={draft.expiry ?? ''}
            onChange={(e) => set('expiry', e.target.value || undefined)}
          />
        </Field>

        {draft.kind === 'homemade' && (
          <Field label="Recipe / batch notes" span>
            <textarea
              className="textarea"
              value={draft.recipe ?? ''}
              placeholder="Ingredients, method, water bath time..."
              onChange={(e) => set('recipe', e.target.value)}
            />
          </Field>
        )}

        <Field label="Notes" span>
          <textarea
            className="textarea"
            value={draft.notes ?? ''}
            style={{ minHeight: 56 }}
            onChange={(e) => set('notes', e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
