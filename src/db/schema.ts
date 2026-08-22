import Dexie, { type EntityTable } from 'dexie';
import type {
  Category,
  GroceryEntry,
  Item,
  Location,
  PriceEntry,
  PrintBatch,
  Receipt,
  Settings,
  Spend,
  Store,
} from '@/domain/types';

/**
 * All data lives locally in IndexedDB. Nothing is sent anywhere -- there is no
 * server. Backup and restore go through JSON export on the Settings page.
 */
class PantryDB extends Dexie {
  items!: EntityTable<Item, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  locations!: EntityTable<Location, 'id'>;
  stores!: EntityTable<Store, 'id'>;
  grocery!: EntityTable<GroceryEntry, 'id'>;
  priceEntries!: EntityTable<PriceEntry, 'id'>;
  receipts!: EntityTable<Receipt, 'id'>;
  spends!: EntityTable<Spend, 'id'>;
  printBatches!: EntityTable<PrintBatch, 'id'>;
  settings!: EntityTable<Settings, 'id'>;

  constructor() {
    super('pantry-tracker');

    this.version(1).stores({
      items: 'id, kind, name, categoryId, locationId, storeId, expiry, archived, updatedAt',
      categories: 'id, name, sortOrder',
      locations: 'id, name, sortOrder',
      stores: 'id, name, sortOrder',
      grocery: 'id, itemId, storeId, categoryId, checked, source, addedAt',
      priceEntries: 'id, itemId, name, storeId, date',
      receipts: 'id, storeId, date',
      spends: 'id, date, storeId, receiptId',
      printBatches: 'id, code, createdAt',
      settings: 'id',
    });
  }
}

export const db = new PantryDB();

/** Short, collision-resistant id. `crypto.randomUUID` where available. */
export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function now(): string {
  return new Date().toISOString();
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  theme: 'farmers-market',
  mode: 'system',
  currency: 'AUD',
  locale: 'en-AU',
  weeklyBudget: 250,
  monthlyBudget: 1000,
  expiryWarnDays: 7,
  weekStartsOn: 1,
};
