import { db, now, uid } from '@/db/schema';
import type { Category, GroceryEntry, Item, Store } from './types';
import { needsRestock, restockQty, stockStatus } from './stock';

/**
 * Keeping the grocery list in step with the pantry.
 *
 * From the notes (photo 01): "low stock or out of stock items automatically
 * added to Grocery list". So:
 *
 *   - an item that goes low or out gains an `auto` line;
 *   - an item that is restocked loses its *unchecked* `auto` line;
 *   - a checked `auto` line is left alone -- you are mid-shop, and yanking the
 *     line out from under you as the count updates would be maddening;
 *   - `manual` lines are never touched.
 *
 * This runs after any mutation that can change stock status. It is idempotent,
 * so calling it more often than strictly necessary is harmless.
 */
export async function syncAutoGrocery(): Promise<{ added: number; removed: number }> {
  let added = 0;
  let removed = 0;

  await db.transaction('rw', [db.items, db.grocery], async () => {
    const items = await db.items.filter((i) => !i.archived).toArray();
    const entries = await db.grocery.toArray();

    const autoByItem = new Map<string, GroceryEntry>();
    for (const e of entries) {
      if (e.source === 'auto' && e.itemId) autoByItem.set(e.itemId, e);
    }

    const stamp = now();

    for (const item of items) {
      // Home made goods and meal prep are not things you buy, so they never
      // generate shopping lines -- you make more instead.
      if (item.kind !== 'pantry') continue;

      const existing = autoByItem.get(item.id);

      if (needsRestock(item)) {
        if (!existing) {
          await db.grocery.add({
            id: uid(),
            itemId: item.id,
            name: item.name,
            qty: restockQty(item),
            unit: item.unit,
            price: item.price,
            categoryId: item.categoryId,
            storeId: item.storeId,
            source: 'auto',
            checked: false,
            addedAt: stamp,
          });
          added++;
        } else if (!existing.checked) {
          // Keep the line honest if the item was renamed or re-categorised.
          await db.grocery.update(existing.id, {
            name: item.name,
            unit: item.unit,
            price: item.price,
            categoryId: item.categoryId,
            storeId: item.storeId,
          });
        }
      } else if (existing && !existing.checked) {
        await db.grocery.delete(existing.id);
        removed++;
      }
    }

    // Drop auto lines whose item has been deleted or archived.
    const liveIds = new Set(items.map((i) => i.id));
    for (const e of entries) {
      if (e.source === 'auto' && e.itemId && !liveIds.has(e.itemId) && !e.checked) {
        await db.grocery.delete(e.id);
        removed++;
      }
    }
  });

  return { added, removed };
}

/** Adds a pantry item to the list by hand (the pantry row checkbox). */
export async function addItemToGrocery(item: Item, qtyOverride?: number): Promise<void> {
  const existing = await db.grocery.where('itemId').equals(item.id).first();
  if (existing) {
    // Already there -- promote an auto line to manual so restocking cannot
    // silently remove something you deliberately added.
    await db.grocery.update(existing.id, { source: 'manual', checked: false });
    return;
  }
  await db.grocery.add({
    id: uid(),
    itemId: item.id,
    name: item.name,
    qty: qtyOverride ?? restockQty(item),
    unit: item.unit,
    price: item.price,
    categoryId: item.categoryId,
    storeId: item.storeId,
    source: 'manual',
    checked: false,
    addedAt: now(),
  });
}

export async function removeItemFromGrocery(itemId: string): Promise<void> {
  const rows = await db.grocery.where('itemId').equals(itemId).toArray();
  await db.grocery.bulkDelete(rows.map((r) => r.id));
}

/* -------------------------------------------------------------------------- */
/* Grouping: "sort by store and departments" (notes, photo 02)                 */
/* -------------------------------------------------------------------------- */

export interface GroceryGroup {
  storeId: string | undefined;
  storeName: string;
  entries: GroceryEntry[];
  subtotal: number;
}

/**
 * Groups list lines by store, ordering each store's lines by that store's
 * `aisleOrder` (falling back to the category's global sort order), which is
 * what "sort by store and departments" means in practice: the list reads in
 * the order you actually walk.
 */
export function groupByStore(
  entries: GroceryEntry[],
  stores: Store[],
  categories: Category[],
): GroceryGroup[] {
  const storeById = new Map(stores.map((s) => [s.id, s]));
  const catById = new Map(categories.map((c) => [c.id, c]));

  const buckets = new Map<string, GroceryEntry[]>();
  for (const e of entries) {
    const key = e.storeId ?? '';
    const list = buckets.get(key);
    if (list) list.push(e);
    else buckets.set(key, [e]);
  }

  const groups: GroceryGroup[] = [];
  for (const [key, list] of buckets) {
    const store = key ? storeById.get(key) : undefined;
    const order = store?.aisleOrder ?? [];

    const rank = (e: GroceryEntry): number => {
      const idx = order.indexOf(e.categoryId);
      if (idx >= 0) return idx;
      // Not in this store's walk order: push past it, keeping global order.
      return order.length + (catById.get(e.categoryId)?.sortOrder ?? 999);
    };

    list.sort((a, b) => {
      // Unchecked first, so the list shortens from the top as you shop.
      if (a.checked !== b.checked) return a.checked ? 1 : -1;
      const r = rank(a) - rank(b);
      if (r !== 0) return r;
      return a.name.localeCompare(b.name);
    });

    groups.push({
      storeId: store?.id,
      storeName: store?.name ?? 'Any store',
      entries: list,
      subtotal: list.reduce((sum, e) => sum + (e.price ?? 0) * e.qty, 0),
    });
  }

  groups.sort((a, b) => {
    const sa = a.storeId ? (storeById.get(a.storeId)?.sortOrder ?? 999) : 9999;
    const sb = b.storeId ? (storeById.get(b.storeId)?.sortOrder ?? 999) : 9999;
    return sa - sb;
  });

  return groups;
}

/** Estimated total for a set of lines -- the "Cost" box on the list header. */
export function listTotal(entries: GroceryEntry[], onlyUnchecked = false): number {
  return entries
    .filter((e) => (onlyUnchecked ? !e.checked : true))
    .reduce((sum, e) => sum + (e.price ?? 0) * e.qty, 0);
}

/**
 * "Out of Stock Value" from photo 04: what it would cost to replace everything
 * currently out of stock.
 */
export function outOfStockValue(items: Item[]): number {
  return items
    .filter((i) => !i.archived && stockStatus(i) === 'out')
    .reduce((sum, i) => sum + (i.price ?? 0) * restockQty(i), 0);
}
