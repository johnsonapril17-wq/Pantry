import type { ExpiryStatus, Item, StockStatus } from './types';

/**
 * Stock status is derived, never stored.
 *
 * This is what makes the out-of-stock tracker and the grocery list "automatic
 * features" (notes, photo 02) rather than lists you keep in step by hand: the
 * single source of truth is `qty` against `lowThreshold`.
 */
export function stockStatus(item: Pick<Item, 'qty' | 'lowThreshold'>): StockStatus {
  if (item.qty <= 0) return 'out';
  if (item.qty <= item.lowThreshold) return 'low';
  return 'in';
}

/** Colour code from the notes: In Stock green, Low yellow, Out red. */
export const STOCK_TONE: Record<StockStatus, 'ok' | 'warn' | 'danger'> = {
  in: 'ok',
  low: 'warn',
  out: 'danger',
};

export const STOCK_LABEL: Record<StockStatus, string> = {
  in: 'In stock',
  low: 'Low',
  out: 'Out',
};

/** Anything low or out belongs on the grocery list. */
export function needsRestock(item: Pick<Item, 'qty' | 'lowThreshold'>): boolean {
  return stockStatus(item) !== 'in';
}

/**
 * How many to buy to get back to the restock target. Falls back to one more
 * than the low threshold so there is always a sensible non-zero suggestion.
 */
export function restockQty(item: Item): number {
  const target = item.restockTo ?? item.lowThreshold + 1;
  const need = target - item.qty;
  return need > 0 ? round2(need) : 1;
}

/* -------------------------------------------------------------------------- */
/* Expiry                                                                      */
/* -------------------------------------------------------------------------- */

/** Midnight today, local time -- the reference point for all day counting. */
export function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Parse a `YYYY-MM-DD` string as local midnight (not UTC). */
export function parseISODate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toISODate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Whole days from today until `iso`. Negative once it has passed. */
export function daysLeft(iso?: string): number | null {
  if (!iso) return null;
  const target = parseISODate(iso);
  if (!target) return null;
  const ms = target.getTime() - today().getTime();
  return Math.round(ms / 86_400_000);
}

export function expiryStatus(iso: string | undefined, warnDays: number): ExpiryStatus {
  const days = daysLeft(iso);
  if (days === null) return 'none';
  if (days < 0) return 'expired';
  if (days <= warnDays) return 'soon';
  return 'ok';
}

export const EXPIRY_TONE: Record<ExpiryStatus, 'ok' | 'warn' | 'danger' | 'neutral'> = {
  none: 'neutral',
  ok: 'ok',
  soon: 'warn',
  expired: 'danger',
};

/** Human phrasing for the "Days Left" column. */
export function daysLeftLabel(iso?: string): string {
  const days = daysLeft(iso);
  if (days === null) return '--';
  if (days < -1) return `${Math.abs(days)} days ago`;
  if (days === -1) return 'Yesterday';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `${days} days`;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
