import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import type { ItemKind } from '@/domain/types';
import { parseISODate } from '@/domain/stock';

/**
 * Everything the app already knows about a product you have entered before.
 *
 * Re-buying the same thing should not mean re-typing its category, location,
 * store, price and thresholds. Picking a previous name refills all of it --
 * everything except the quantity, which is the one field that is genuinely
 * different every time.
 */
export interface ItemTemplate {
  name: string;
  kind: ItemKind;
  unit: string;
  categoryId: string;
  locationId: string;
  storeId?: string;
  price?: number;
  lowThreshold: number;
  restockTo?: number;
  notes?: string;
  recipe?: string;
  portions?: number;
  /**
   * How long this kept last time, in days, derived from the gap between when
   * the item was created and the expiry that was set on it.
   *
   * Copying the old expiry *date* forward would be worse than useless -- it is
   * in the past, so a brand new carton of milk would show up expired. Carrying
   * the shelf life instead reproduces the intent.
   */
  shelfLifeDays?: number;
  /** Most recent time this product was touched; drives suggestion order. */
  lastUsedAt: string;
  /** True when a live, non-archived item with this name already exists. */
  inStockNow: boolean;
}

/**
 * Builds one template per distinct product name, newest wins.
 *
 * Sourced from the items table including archived rows, so archiving something
 * does not lose the setup work. Hard-deleted items are genuinely gone; their
 * names survive only in price history, which lacks the category and location
 * needed to make a useful template.
 */
export function useItemTemplates(kind: ItemKind): ItemTemplate[] {
  return (
    useLiveQuery(
      async () => {
        const all = await db.items.toArray();
        const byName = new Map<string, ItemTemplate>();

        for (const item of all) {
          if (item.kind !== kind) continue;

          const key = item.name.trim().toLowerCase();
          if (!key) continue;

          const stamp = item.updatedAt || item.createdAt;
          const existing = byName.get(key);

          // Keep the most recently touched version of each name, but let any
          // live item win over an archived one regardless of timestamp.
          if (existing) {
            const beatsOnLiveness = !item.archived && !existing.inStockNow;
            const beatsOnRecency =
              (!item.archived || !existing.inStockNow) && stamp > existing.lastUsedAt;
            if (!beatsOnLiveness && !beatsOnRecency) {
              if (!item.archived) existing.inStockNow = true;
              continue;
            }
          }

          byName.set(key, {
            name: item.name.trim(),
            kind: item.kind,
            unit: item.unit,
            categoryId: item.categoryId,
            locationId: item.locationId,
            storeId: item.storeId,
            price: item.price,
            lowThreshold: item.lowThreshold,
            restockTo: item.restockTo,
            notes: item.notes,
            recipe: item.recipe,
            portions: item.portions,
            shelfLifeDays: shelfLife(item.createdAt, item.expiry),
            lastUsedAt: stamp,
            inStockNow: existing?.inStockNow || !item.archived,
          });
        }

        return [...byName.values()].sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
      },
      [kind],
      [],
    ) ?? []
  );
}

/** Days between creation and expiry, when both are known and sane. */
function shelfLife(createdAt: string, expiry?: string): number | undefined {
  if (!expiry) return undefined;
  const end = parseISODate(expiry);
  const start = parseISODate(createdAt.slice(0, 10));
  if (!end || !start) return undefined;
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  return days > 0 ? days : undefined;
}
