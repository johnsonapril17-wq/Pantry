import { useLiveQuery } from 'dexie-react-hooks';
import { DEFAULT_SETTINGS, db } from '@/db/schema';
import type { Category, Item, Location, Settings, Store } from '@/domain/types';

/**
 * Thin `useLiveQuery` wrappers. Every one of these re-renders automatically
 * when the underlying table changes, which is why no component in the app has
 * to manually refresh after a write.
 */

const EMPTY: never[] = [];

export function useSettings(): Settings {
  return useLiveQuery(async () => (await db.settings.get('settings')) ?? DEFAULT_SETTINGS, [],
    DEFAULT_SETTINGS)!;
}

export function useCategories(): Category[] {
  return (
    useLiveQuery(() => db.categories.orderBy('sortOrder').toArray(), [], EMPTY) ?? EMPTY
  );
}

export function useLocations(): Location[] {
  return useLiveQuery(() => db.locations.orderBy('sortOrder').toArray(), [], EMPTY) ?? EMPTY;
}

export function useStores(): Store[] {
  return useLiveQuery(() => db.stores.orderBy('sortOrder').toArray(), [], EMPTY) ?? EMPTY;
}

/** All non-archived items, optionally restricted to one kind. */
export function useItems(kind?: Item['kind']): Item[] {
  return (
    useLiveQuery(
      async () => {
        const all = await db.items.toArray();
        return all
          .filter((i) => !i.archived && (kind ? i.kind === kind : true))
          .sort((a, b) => a.name.localeCompare(b.name));
      },
      [kind],
      EMPTY,
    ) ?? EMPTY
  );
}

export function useGrocery() {
  return useLiveQuery(() => db.grocery.toArray(), [], EMPTY) ?? EMPTY;
}

export function usePriceEntries() {
  return useLiveQuery(() => db.priceEntries.reverse().sortBy('date'), [], EMPTY) ?? EMPTY;
}

export function useReceipts() {
  return useLiveQuery(async () => (await db.receipts.toArray()).sort(byDateDesc), [], EMPTY) ?? EMPTY;
}

export function useSpends() {
  return useLiveQuery(async () => (await db.spends.toArray()).sort(byDateDesc), [], EMPTY) ?? EMPTY;
}

export function usePrintBatches() {
  return (
    useLiveQuery(
      async () => (await db.printBatches.toArray()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      [],
      EMPTY,
    ) ?? EMPTY
  );
}

function byDateDesc(a: { date: string }, b: { date: string }): number {
  return b.date.localeCompare(a.date);
}

/* -------------------------------------------------------------------------- */
/* Lookup helpers                                                              */
/* -------------------------------------------------------------------------- */

export function nameMap<T extends { id: string; name: string }>(rows: T[]): Map<string, string> {
  return new Map(rows.map((r) => [r.id, r.name]));
}

export function byId<T extends { id: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((r) => [r.id, r]));
}
