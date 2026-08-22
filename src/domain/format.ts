import { parseISODate, toISODate } from './stock';

/* -------------------------------------------------------------------------- */
/* Money                                                                       */
/* -------------------------------------------------------------------------- */

const moneyCache = new Map<string, Intl.NumberFormat>();

function moneyFormatter(locale: string, currency: string): Intl.NumberFormat {
  const key = `${locale}|${currency}`;
  let f = moneyCache.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(locale, { style: 'currency', currency });
    } catch {
      f = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    }
    moneyCache.set(key, f);
  }
  return f;
}

export function money(value: number | undefined | null, locale = 'en-AU', currency = 'AUD'): string {
  if (value == null || Number.isNaN(value)) return '--';
  return moneyFormatter(locale, currency).format(value);
}

/** Money without the symbol -- for table columns that already have a header. */
export function moneyPlain(value: number | undefined | null): string {
  if (value == null || Number.isNaN(value)) return '--';
  return value.toFixed(2);
}

/* -------------------------------------------------------------------------- */
/* Quantities                                                                  */
/* -------------------------------------------------------------------------- */

/** Trims pointless decimals: 2.00 -> "2", 1.50 -> "1.5". */
export function qty(n: number | undefined | null): string {
  if (n == null || Number.isNaN(n)) return '--';
  return String(Math.round(n * 100) / 100);
}

export function qtyUnit(n: number | undefined | null, unit: string): string {
  return `${qty(n)}${unit && unit !== 'ea' ? ` ${unit}` : ''}`;
}

/* -------------------------------------------------------------------------- */
/* Dates                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Day + month, with the year appended only when it is not the current one --
 * without that, a date 300 days out reads as "18 Jun" and looks like it has
 * already passed.
 */
export function shortDate(iso?: string, locale = 'en-AU'): string {
  if (!iso) return '--';
  const d = parseISODate(iso) ?? new Date(iso);
  if (Number.isNaN(d.getTime())) return '--';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: sameYear ? undefined : '2-digit',
  });
}

export function mediumDate(iso?: string, locale = 'en-AU'): string {
  if (!iso) return '--';
  const d = parseISODate(iso) ?? new Date(iso);
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function monthLabel(iso: string, locale = 'en-AU'): string {
  const d = parseISODate(iso) ?? new Date(iso);
  return d.toLocaleDateString(locale, { month: 'short', year: '2-digit' });
}

/** Start of the budget week containing `d`, honouring `weekStartsOn` (0 = Sun). */
export function startOfWeek(d: Date, weekStartsOn = 1): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const diff = (out.getDay() - weekStartsOn + 7) % 7;
  out.setDate(out.getDate() - diff);
  return out;
}

export function endOfWeek(d: Date, weekStartsOn = 1): Date {
  const start = startOfWeek(d, weekStartsOn);
  const out = new Date(start);
  out.setDate(out.getDate() + 6);
  return out;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

export function addMonths(d: Date, months: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + months, 1);
}

/** True when `iso` falls in [from, to] inclusive, comparing dates only. */
export function withinRange(iso: string, from: Date, to: Date): boolean {
  const d = parseISODate(iso);
  if (!d) return false;
  return d.getTime() >= from.getTime() && d.getTime() <= to.getTime();
}

export function rangeLabel(from: Date, to: Date, locale = 'en-AU'): string {
  const same = from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear();
  const a = from.toLocaleDateString(locale, { day: 'numeric', month: same ? undefined : 'short' });
  const b = to.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  return `${a} - ${b}`;
}

export { toISODate };

/* -------------------------------------------------------------------------- */
/* Misc                                                                        */
/* -------------------------------------------------------------------------- */

export function pluralise(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function percent(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}
