/**
 * Turning a category's swatch colour into text you can actually read.
 *
 * A category colour is chosen to be recognisable, not legible. Nine such hues
 * printed straight onto the page would fail WCAG AA in at least one theme --
 * mid-tone colours are too pale on a near-white surface and too dark on a
 * near-black one, and no single hex clears 4.5:1 against both.
 *
 * So the hue is kept and the *lightness* is moved until the contrast is there:
 * darkened for light mode, lightened for dark mode. The category stays
 * recognisably itself in both, and the text stays readable in both.
 */

const AA_TEXT = 4.5;

/**
 * Contrast is measured against the hardest background in each mode rather than
 * the live one: the darkest light background, and the lightest dark background.
 * Clearing those clears all six theme/mode combinations, which keeps this a
 * pure function -- no reading computed styles, no re-running on theme change.
 *
 * These are every `--bg`, `--bg-sunken`, `--surface` and `--surface-2` in
 * tokens.css, not just `--surface`: a category tag sits on a group row and on
 * the page behind the table as well as on a card. If a palette ever gets a
 * background outside this range, re-run `npm run check:contrast`.
 */
const WORST_LIGHT_SURFACE = '#e6e8e5'; // modern-bistro --bg-sunken
const WORST_DARK_SURFACE = '#2c3122'; // farmers-market --surface-2

export interface ReadablePair {
  /** Shade to use when `data-mode="light"`. */
  light: string;
  /** Shade to use when `data-mode="dark"`. */
  dark: string;
}

/* -------------------------------------------------------------------------- */
/* Colour maths                                                                */
/* -------------------------------------------------------------------------- */

type RGB = [number, number, number];

function parseHex(hex: string): RGB | null {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: RGB): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`;
}

function relativeLuminance([r, g, b]: RGB): number {
  const chan = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2];
}

export function contrastRatio(a: string, b: string): number {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return 1;
  const la = relativeLuminance(ca);
  const lb = relativeLuminance(cb);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;

  if (d === 0) return [0, 0, l];

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;

  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): RGB {
  if (s === 0) {
    const v = l * 255;
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [channel(h + 1 / 3) * 255, channel(h) * 255, channel(h - 1 / 3) * 255];
}

/* -------------------------------------------------------------------------- */
/* Readable shades                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Walks lightness towards the given end of the scale until the colour clears
 * `AA_TEXT` against `surface`, keeping hue and saturation.
 *
 * Steps in fixed increments rather than binary searching: the contrast curve is
 * monotonic in lightness here, so the first passing step is also the closest
 * one to the original colour -- which is the shade that still looks like the
 * category.
 */
function shadeUntilReadable(hex: string, surface: string, direction: 'darker' | 'lighter'): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  if (contrastRatio(hex, surface) >= AA_TEXT) return hex;

  const [h, s, l] = rgbToHsl(rgb);
  const step = direction === 'darker' ? -0.02 : 0.02;

  for (let i = 1; i <= 50; i++) {
    const nextL = Math.max(0, Math.min(1, l + step * i));
    const candidate = toHex(hslToRgb(h, s, nextL));
    if (contrastRatio(candidate, surface) >= AA_TEXT) return candidate;
    if (nextL <= 0 || nextL >= 1) break;
  }

  // Pure black or white always clears it; only reachable for a degenerate hue.
  return direction === 'darker' ? '#000000' : '#ffffff';
}

const cache = new Map<string, ReadablePair>();

/**
 * Readable light-mode and dark-mode shades of a category colour.
 *
 * Cached because it is called for every row of every list, and the input set is
 * the handful of category colours.
 */
export function readableCategoryColour(hex: string | undefined): ReadablePair | null {
  if (!hex) return null;
  const cached = cache.get(hex);
  if (cached) return cached;

  if (!parseHex(hex)) return null;

  const pair: ReadablePair = {
    light: shadeUntilReadable(hex, WORST_LIGHT_SURFACE, 'darker'),
    dark: shadeUntilReadable(hex, WORST_DARK_SURFACE, 'lighter'),
  };
  cache.set(hex, pair);
  return pair;
}
