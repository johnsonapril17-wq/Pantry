/**
 * Core data model.
 *
 * Everything the app stores lives in IndexedDB (see `src/db/schema.ts`). Dates
 * are stored as ISO date strings (`YYYY-MM-DD`) for anything a human picks,
 * and as full ISO timestamps for anything the app stamps automatically. That
 * keeps date-only comparisons free of timezone surprises.
 */

export type ID = string;

/** Which section of the app an inventory row belongs to. */
export type ItemKind =
  /** Bought-in food: the main pantry inventory. */
  | 'pantry'
  /** Home made goods -- pickles, jams, sauces. */
  | 'homemade'
  /** Freezer meals / prepped food. */
  | 'mealprep';

export type StockStatus = 'in' | 'low' | 'out';

export type ExpiryStatus = 'none' | 'ok' | 'soon' | 'expired';

/** A single inventory row -- the "Pantry Tracker" table from the notes. */
export interface Item {
  id: ID;
  kind: ItemKind;
  name: string;
  qty: number;
  unit: string;
  categoryId: ID;
  locationId: ID;
  /** Where this is usually bought. Drives grocery-list grouping. */
  storeId?: ID;
  /** Most recent price paid. The full history lives in `priceEntries`. */
  price?: number;
  /** `qty` at or below this counts as Low. Zero or less counts as Out. */
  lowThreshold: number;
  /** Restock target -- how many to buy when it runs low. */
  restockTo?: number;
  /** ISO date (`YYYY-MM-DD`). */
  expiry?: string;
  notes?: string;

  /** Home made goods only. */
  batchDate?: string;
  recipe?: string;
  /** Meal prep only: servings per container. */
  portions?: number;

  createdAt: string;
  updatedAt: string;
  /** Last time the quantity was confirmed by a physical count. */
  lastCountedAt?: string;
  archived?: boolean;
}

export interface Category {
  id: ID;
  name: string;
  /** Store department this category usually sits in, e.g. "Fresh", "Ambient". */
  department: string;
  sortOrder: number;
  /** Key into `src/components/icons.tsx`. */
  icon: string;
}

export interface Location {
  id: ID;
  name: string;
  sortOrder: number;
  icon: string;
}

export interface Store {
  id: ID;
  name: string;
  sortOrder: number;
  /**
   * Category ids in the order you physically walk the store. The grocery list
   * uses this to order departments within a store; anything not listed falls
   * back to the category's own `sortOrder`.
   */
  aisleOrder: ID[];
  colour?: string;
}

/** A line on the grocery list. */
export interface GroceryEntry {
  id: ID;
  /** Set when the line came from a pantry item; absent for ad-hoc lines. */
  itemId?: ID;
  name: string;
  qty: number;
  unit: string;
  price?: number;
  categoryId: ID;
  storeId?: ID;
  /**
   * `auto` lines are managed by the app -- created when an item goes low or
   * out, removed when it is restocked. `manual` lines are yours and are never
   * removed automatically.
   */
  source: 'auto' | 'manual';
  checked: boolean;
  addedAt: string;
  checkedAt?: string;
  note?: string;
}

/** One observation of what something cost, where and when. */
export interface PriceEntry {
  id: ID;
  itemId?: ID;
  name: string;
  /** Price for `qty` x `unit`. */
  price: number;
  qty: number;
  unit: string;
  storeId?: ID;
  /** ISO date. */
  date: string;
  receiptId?: ID;
  note?: string;
}

/** A shop -- either photographed or keyed in by hand. */
export interface Receipt {
  id: ID;
  storeId?: ID;
  /** ISO date. */
  date: string;
  total: number;
  /** The photo itself, kept in IndexedDB as a Blob. */
  image?: Blob;
  imageName?: string;
  notes?: string;
  createdAt: string;
}

/** Money out. Every receipt creates one; you can also add them by hand. */
export interface Spend {
  id: ID;
  /** ISO date. */
  date: string;
  amount: number;
  storeId?: ID;
  receiptId?: ID;
  categoryId?: ID;
  note?: string;
  createdAt: string;
}

export type ThemeName = 'farmers-market' | 'modern-bistro' | 'minimalist';
export type ModeSetting = 'light' | 'dark' | 'system';

export interface Settings {
  id: 'settings';
  theme: ThemeName;
  mode: ModeSetting;
  /** ISO 4217 code, e.g. "AUD". */
  currency: string;
  /** BCP 47 tag used for number and date formatting. */
  locale: string;
  weeklyBudget: number;
  monthlyBudget: number;
  /** Days-left threshold below which an item counts as "expiring soon". */
  expiryWarnDays: number;
  /** ISO date of the last full stocktake. Shown on the pantry page. */
  lastInventoryDate?: string;
  /** Day the budget week rolls over. 0 = Sunday. */
  weekStartsOn: number;
  seeded?: boolean;
}

/** A printed stocktake sheet, so a scanned code can be matched back to rows. */
export interface PrintBatch {
  id: ID;
  /** Short human-readable code printed on the sheet, e.g. "PT-4F2A". */
  code: string;
  title: string;
  itemIds: ID[];
  createdAt: string;
  /** Set once the counts from this sheet have been entered. */
  appliedAt?: string;
}
