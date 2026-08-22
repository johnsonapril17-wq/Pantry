import { parseISODate, toISODate } from './stock';

/* -------------------------------------------------------------------------- */
/* Locale safety                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The locale is a free-text setting, so it can be anything the user typed --
 * `en-CAD`, a half-finished tag mid-keystroke, or empty. Every `Intl` call and
 * every `toLocale*String` throws a RangeError on an invalid tag, and an
 * exception thrown during render unmounts the entire app.
 *
 * So: no locale reaches `Intl` without passing through here first. An invalid
 * tag silently falls back to the browser default rather than taking the app
 * down over a formatting preference.
 */
const localeCache = new Map<string, string | undefined>();

export function safeLocale(locale: string | undefined): string | undefined {
  if (!locale) return undefined;
  if (localeCache.has(locale)) return localeCache.get(locale);

  let resolved: string | undefined;
  try {
    resolved = Intl.getCanonicalLocales(locale)[0];
  } catch {
    resolved = undefined;
  }

  localeCache.set(locale, resolved);
  return resolved;
}

/** True when `locale` is a well-formed BCP 47 tag. Used to validate input. */
export function isValidLocale(locale: string): boolean {
  return safeLocale(locale) !== undefined;
}

/** True when `currency` is a well-formed ISO 4217 code. */
export function isValidCurrency(currency: string): boolean {
  try {
    new Intl.NumberFormat(undefined, { style: 'currency', currency });
    return true;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Money                                                                       */
/* -------------------------------------------------------------------------- */

const moneyCache = new Map<string, Intl.NumberFormat>();

function moneyFormatter(locale: string, currency: string): Intl.NumberFormat {
  const key = `${locale}|${currency}`;
  let f = moneyCache.get(key);
  if (!f) {
    const tag = safeLocale(locale);
    try {
      f = new Intl.NumberFormat(tag, { style: 'currency', currency });
    } catch {
      // Bad currency code as well as a bad locale: fall back to plain numbers
      // with a currency-shaped format rather than showing nothing.
      try {
        f = new Intl.NumberFormat(tag, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      } catch {
        f = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
      }
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
/** Every date formatter routes through here, so a bad tag can never throw. */
function formatDate(d: Date, locale: string, options: Intl.DateTimeFormatOptions): string {
  return d.toLocaleDateString(safeLocale(locale), options);
}

export function shortDate(iso?: string, locale = 'en-AU'): string {
  if (!iso) return '--';
  const d = parseISODate(iso) ?? new Date(iso);
  if (Number.isNaN(d.getTime())) return '--';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return formatDate(d, locale, {
    day: 'numeric',
    month: 'short',
    year: sameYear ? undefined : '2-digit',
  });
}

export function mediumDate(iso?: string, locale = 'en-AU'): string {
  if (!iso) return '--';
  const d = parseISODate(iso) ?? new Date(iso);
  if (Number.isNaN(d.getTime())) return '--';
  return formatDate(d, locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function monthLabel(iso: string, locale = 'en-AU'): string {
  const d = parseISODate(iso) ?? new Date(iso);
  if (Number.isNaN(d.getTime())) return '--';
  return formatDate(d, locale, { month: 'short', year: '2-digit' });
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
  const a = formatDate(from, locale, { day: 'numeric', month: same ? undefined : 'short' });
  const b = formatDate(to, locale, { day: 'numeric', month: 'short' });
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
