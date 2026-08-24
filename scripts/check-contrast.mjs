/**
 * Contrast audit for the theme tokens and the category colours.
 *
 * Two things drift silently and are invisible until someone with the wrong
 * theme reports that they cannot read a column:
 *
 *   1. A new or edited palette in tokens.css putting text below AA.
 *   2. A background added outside the range `src/domain/colour.ts` derives its
 *      readable category shades against, which would quietly invalidate them.
 *
 * Both are arithmetic, so they are checked rather than eyeballed. Run with
 * `npm run check:contrast`; exits non-zero on any failure.
 *
 * The category shades are imported from the real implementation, not
 * reimplemented here -- a copy would pass while the app failed.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contrastRatio, readableCategoryColour } from '../src/domain/colour.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3.0;

/** Seed category colours, kept in step with `src/db/seed.ts`. */
const CATEGORY_COLOURS = {
  'Fruit & Veg': '#16a34a',
  'Meat & Seafood': '#dc2626',
  'Dairy & Eggs': '#2563eb',
  Bakery: '#d97706',
  'Pantry Staples': '#8b5cf6',
  Snacks: '#db2777',
  Drinks: '#0d9488',
  Frozen: '#0ea5e9',
  Household: '#64748b',
};

/** Foreground/background token pairs that must hold in every theme and mode. */
const TOKEN_PAIRS = [
  ['text', 'surface', AA_TEXT],
  ['text', 'bg', AA_TEXT],
  ['text', 'surface-2', AA_TEXT],
  ['text-muted', 'surface', AA_TEXT],
  ['text-faint', 'surface', AA_NON_TEXT],
  ['accent-contrast', 'accent', AA_TEXT],
  ['accent-contrast', 'accent-hover', AA_TEXT],
  ['accent-soft-text', 'accent-soft', AA_TEXT],
  ['ok-soft-text', 'ok-soft', AA_TEXT],
  ['warn-soft-text', 'warn-soft', AA_TEXT],
  ['danger-soft-text', 'danger-soft', AA_TEXT],
  ['ok', 'surface', AA_NON_TEXT],
  ['warn', 'surface', AA_NON_TEXT],
  ['danger', 'surface', AA_NON_TEXT],
  ['accent', 'surface', AA_NON_TEXT],
];

const BACKGROUND_TOKENS = new Set(['bg', 'bg-sunken', 'surface', 'surface-2']);

function readPalettes() {
  const css = fs.readFileSync(path.join(root, 'src/styles/tokens.css'), 'utf8');
  const blockRe =
    /\[data-theme='([a-z-]+)'\]\[data-mode='(light|dark)'\]\s*\{([^}]*)\}/g;
  const palettes = {};

  for (const match of css.matchAll(blockRe)) {
    const tokens = {};
    for (const line of match[3].split('\n')) {
      const t = line.match(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/);
      if (t) tokens[t[1]] = t[2].toLowerCase();
    }
    palettes[`${match[1]}/${match[2]}`] = { mode: match[2], tokens };
  }
  return palettes;
}

const palettes = readPalettes();
const failures = [];
let checks = 0;

if (Object.keys(palettes).length === 0) {
  console.error('No theme blocks parsed from tokens.css -- the audit checked nothing.');
  process.exit(1);
}

/* 1. Token pairs, per theme and mode. -------------------------------------- */

for (const [name, { tokens }] of Object.entries(palettes)) {
  for (const [fg, bg, min] of TOKEN_PAIRS) {
    if (!tokens[fg] || !tokens[bg]) {
      failures.push(`${name}: missing --${fg} or --${bg}`);
      continue;
    }
    checks++;
    const ratio = contrastRatio(tokens[fg], tokens[bg]);
    if (ratio < min) {
      failures.push(
        `${name}: --${fg} on --${bg} is ${ratio.toFixed(2)}:1, needs ${min}:1`,
      );
    }
  }
}

/* 2. Every block must define the same tokens. ------------------------------ */

const names = Object.keys(palettes);
const reference = new Set(Object.keys(palettes[names[0]].tokens));
for (const name of names.slice(1)) {
  const here = new Set(Object.keys(palettes[name].tokens));
  const missing = [...reference].filter((k) => !here.has(k));
  const extra = [...here].filter((k) => !reference.has(k));
  if (missing.length) failures.push(`${name}: missing tokens ${missing.join(', ')}`);
  if (extra.length) failures.push(`${name}: unexpected tokens ${extra.join(', ')}`);
}

/* 3. Category names, against every background in the app. ------------------ */

const backgrounds = { light: [], dark: [] };
for (const [name, { mode, tokens }] of Object.entries(palettes)) {
  for (const key of BACKGROUND_TOKENS) {
    if (tokens[key]) backgrounds[mode].push([`${name} --${key}`, tokens[key]]);
  }
}

for (const [label, hex] of Object.entries(CATEGORY_COLOURS)) {
  const pair = readableCategoryColour(hex);
  if (!pair) {
    failures.push(`category ${label}: ${hex} did not resolve to a readable pair`);
    continue;
  }
  for (const mode of ['light', 'dark']) {
    for (const [bgName, bgHex] of backgrounds[mode]) {
      checks++;
      const ratio = contrastRatio(pair[mode], bgHex);
      if (ratio < AA_TEXT) {
        failures.push(
          `category ${label} (${mode} shade ${pair[mode]}) on ${bgName} is ` +
            `${ratio.toFixed(2)}:1, needs ${AA_TEXT}:1`,
        );
      }
    }
  }
}

/* Report ------------------------------------------------------------------- */

if (failures.length) {
  console.error(`Contrast audit FAILED -- ${failures.length} of ${checks} checks:\n`);
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}

console.log(
  `Contrast audit passed: ${checks} checks across ` +
    `${names.length} theme/mode combinations and ` +
    `${Object.keys(CATEGORY_COLOURS).length} category colours.`,
);
