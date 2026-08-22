import { useEffect, useState } from 'react';
import { db, now, uid } from '@/db/schema';
import type { Item, ItemKind } from '@/domain/types';
import { syncAutoGrocery } from '@/domain/grocery';
import { useCategories, useLocations, useSettings, useStores } from '@/hooks/useData';
import { useItemTemplates, type ItemTemplate } from '@/hooks/useItemTemplates';
import { Field, Modal, useToast } from './ui';
import { ItemPicker } from './ItemPicker';
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
  const settings = useSettings();
  const toast = useToast();
  const allTemplates = useItemTemplates(kind);

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

  // When editing, the item being edited is not a useful suggestion for itself.
  const templates = item
    ? allTemplates.filter((t) => t.name.toLowerCase() !== item.name.trim().toLowerCase())
    : allTemplates;

  /**
   * Refill the form from a product entered before.
   *
   * Quantity is deliberately left alone -- it is the one thing that really is
   * different every time, and clobbering what the user just typed would be
   * infuriating. Expiry is rebuilt from the remembered shelf life rather than
   * copied, so a new carton of milk is not born expired.
   */
  const applyTemplate = (t: ItemTemplate) => {
    setDraft((d) =>
      d
        ? {
            ...d,
            name: t.name,
            unit: t.unit,
            categoryId: t.categoryId,
            locationId: t.locationId,
            storeId: t.storeId,
            price: t.price,
            lowThreshold: t.lowThreshold,
            restockTo: t.restockTo,
            notes: t.notes ?? '',
            recipe: t.recipe,
            portions: t.portions ?? d.portions,
            expiry: t.shelfLifeDays
              ? toISODate(new Date(Date.now() + t.shelfLifeDays * 86_400_000))
              : d.expiry,
          }
        : d,
    );
  };

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
        <Field
          label="Item / Food"
          span
          hint={
            templates.length > 0
              ? 'Pick something you have bought before to refill everything but the quantity.'
              : undefined
          }
        >
          <ItemPicker
            value={draft.name}
            templates={templates}
            placeholder={isPantry ? 'e.g. Plain flour' : 'e.g. Bread & butter pickles'}
            locale={settings.locale}
            currency={settings.currency}
            categoryName={(id) => categories.find((c) => c.id === id)?.name ?? ''}
            locationName={(id) => locations.find((l) => l.id === id)?.name ?? ''}
            onChange={(name) => set('name', name)}
            onPick={applyTemplate}
            onSubmit={save}
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
