import { DEFAULT_SETTINGS, db, now, uid } from './schema';
import type { Category, Item, Location, Store } from '@/domain/types';
import { toISODate } from '@/domain/stock';
import { syncAutoGrocery } from '@/domain/grocery';

/**
 * First-run data: the categories, locations and stores the app needs in order
 * to be usable at all. Without these, adding the first item means filling in
 * three empty dropdowns first.
 *
 * Ids are stable slugs rather than random uids so seed data can be referenced
 * from the demo set below and from tests.
 */

const CATEGORIES: Category[] = [
  { id: 'cat-produce', name: 'Fruit & Veg', department: 'Fresh', sortOrder: 10, icon: 'apple' },
  { id: 'cat-meat', name: 'Meat & Seafood', department: 'Fresh', sortOrder: 20, icon: 'beef' },
  { id: 'cat-dairy', name: 'Dairy & Eggs', department: 'Fresh', sortOrder: 30, icon: 'milk' },
  { id: 'cat-bakery', name: 'Bakery', department: 'Fresh', sortOrder: 40, icon: 'croissant' },
  { id: 'cat-pantry', name: 'Pantry Staples', department: 'Ambient', sortOrder: 50, icon: 'wheat' },
  { id: 'cat-tins', name: 'Tins & Jars', department: 'Ambient', sortOrder: 60, icon: 'can' },
  { id: 'cat-spices', name: 'Herbs & Spices', department: 'Ambient', sortOrder: 70, icon: 'leaf' },
  { id: 'cat-baking', name: 'Baking', department: 'Ambient', sortOrder: 80, icon: 'cake' },
  { id: 'cat-snacks', name: 'Snacks', department: 'Ambient', sortOrder: 90, icon: 'cookie' },
  { id: 'cat-drinks', name: 'Drinks', department: 'Ambient', sortOrder: 100, icon: 'cup' },
  { id: 'cat-frozen', name: 'Frozen', department: 'Frozen', sortOrder: 110, icon: 'snowflake' },
  { id: 'cat-household', name: 'Household', department: 'Non-food', sortOrder: 120, icon: 'spray' },
];

const LOCATIONS: Location[] = [
  { id: 'loc-pantry', name: 'Pantry', sortOrder: 10, icon: 'door' },
  { id: 'loc-fridge', name: 'Fridge', sortOrder: 20, icon: 'fridge' },
  { id: 'loc-freezer', name: 'Freezer', sortOrder: 30, icon: 'snowflake' },
  { id: 'loc-cupboard', name: 'Kitchen Cupboard', sortOrder: 40, icon: 'cupboard' },
  { id: 'loc-garage', name: 'Garage Shelf', sortOrder: 50, icon: 'box' },
];

const STORES: Store[] = [
  {
    id: 'store-main',
    name: 'Main Supermarket',
    sortOrder: 10,
    colour: '#4d7c0f',
    // Walk order: fresh perimeter first, then centre aisles, then frozen.
    aisleOrder: [
      'cat-produce',
      'cat-bakery',
      'cat-meat',
      'cat-dairy',
      'cat-pantry',
      'cat-tins',
      'cat-spices',
      'cat-baking',
      'cat-snacks',
      'cat-drinks',
      'cat-household',
      'cat-frozen',
    ],
  },
  { id: 'store-market', name: 'Farmers Market', sortOrder: 20, colour: '#b45309', aisleOrder: [] },
  { id: 'store-butcher', name: 'Butcher', sortOrder: 30, colour: '#a4161a', aisleOrder: [] },
  { id: 'store-bulk', name: 'Bulk / Wholesale', sortOrder: 40, colour: '#0f766e', aisleOrder: [] },
];

/** Seeds reference data if the database is empty. Safe to call on every boot. */
export async function ensureSeeded(): Promise<void> {
  const settings = await db.settings.get('settings');
  if (settings?.seeded) return;

  await db.transaction(
    'rw',
    [db.categories, db.locations, db.stores, db.settings],
    async () => {
      if ((await db.categories.count()) === 0) await db.categories.bulkAdd(CATEGORIES);
      if ((await db.locations.count()) === 0) await db.locations.bulkAdd(LOCATIONS);
      if ((await db.stores.count()) === 0) await db.stores.bulkAdd(STORES);
      await db.settings.put({ ...DEFAULT_SETTINGS, ...settings, id: 'settings', seeded: true });
    },
  );
}

/* -------------------------------------------------------------------------- */
/* Demo data -- opt-in from Settings, so an empty app stays genuinely empty.   */
/* -------------------------------------------------------------------------- */

function offsetDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

type DemoRow = [
  name: string,
  qty: number,
  unit: string,
  categoryId: string,
  locationId: string,
  price: number,
  low: number,
  expiryOffset: number | null,
];

const DEMO_PANTRY: DemoRow[] = [
  ['Plain flour', 2, 'kg', 'cat-pantry', 'loc-pantry', 3.2, 1, 240],
  ['Caster sugar', 1, 'kg', 'cat-baking', 'loc-pantry', 2.6, 1, 400],
  ['Olive oil', 0, 'L', 'cat-pantry', 'loc-pantry', 12.5, 1, 500],
  ['Basmati rice', 4, 'kg', 'cat-pantry', 'loc-pantry', 4.8, 2, 300],
  ['Tinned tomatoes', 3, 'can', 'cat-tins', 'loc-pantry', 1.1, 6, 420],
  ['Chickpeas', 1, 'can', 'cat-tins', 'loc-pantry', 1.35, 4, 380],
  ['Milk', 2, 'L', 'cat-dairy', 'loc-fridge', 3.1, 2, 5],
  ['Butter', 1, 'block', 'cat-dairy', 'loc-fridge', 6.5, 1, 40],
  ['Free range eggs', 6, 'ea', 'cat-dairy', 'loc-fridge', 0.65, 6, 12],
  ['Greek yoghurt', 1, 'tub', 'cat-dairy', 'loc-fridge', 5.9, 1, -2],
  ['Chicken thighs', 1.2, 'kg', 'cat-meat', 'loc-freezer', 11.9, 1, 90],
  ['Beef mince', 0, 'kg', 'cat-meat', 'loc-freezer', 14.5, 1, null],
  ['Sourdough loaf', 1, 'ea', 'cat-bakery', 'loc-cupboard', 6.5, 1, 3],
  ['Bananas', 5, 'ea', 'cat-produce', 'loc-cupboard', 0.55, 3, 4],
  ['Baby spinach', 1, 'bag', 'cat-produce', 'loc-fridge', 4.0, 1, -1],
  ['Brown onions', 4, 'ea', 'cat-produce', 'loc-pantry', 0.7, 3, 25],
  ['Cumin seeds', 1, 'jar', 'cat-spices', 'loc-cupboard', 3.4, 1, 500],
  ['Smoked paprika', 0, 'jar', 'cat-spices', 'loc-cupboard', 4.2, 1, null],
  ['Peas', 2, 'bag', 'cat-frozen', 'loc-freezer', 3.0, 1, 200],
  ['Dishwasher tablets', 1, 'box', 'cat-household', 'loc-cupboard', 14.0, 1, null],
  ['Coffee beans', 1, 'bag', 'cat-drinks', 'loc-pantry', 18.0, 1, 60],
  ['Pasta', 5, 'pkt', 'cat-pantry', 'loc-pantry', 1.8, 2, 350],
];

export async function loadDemoData(): Promise<void> {
  const stamp = now();
  const items: Item[] = DEMO_PANTRY.map(
    ([name, qty, unit, categoryId, locationId, price, low, exp]) => ({
      id: uid(),
      kind: 'pantry' as const,
      name,
      qty,
      unit,
      categoryId,
      locationId,
      storeId: 'store-main',
      price,
      lowThreshold: low,
      restockTo: low + 2,
      expiry: exp === null ? undefined : offsetDate(exp),
      createdAt: stamp,
      updatedAt: stamp,
    }),
  );

  items.push(
    {
      id: uid(),
      kind: 'homemade',
      name: 'Bread & butter pickles',
      qty: 4,
      unit: 'jar',
      categoryId: 'cat-tins',
      locationId: 'loc-pantry',
      lowThreshold: 1,
      batchDate: offsetDate(-30),
      expiry: offsetDate(300),
      recipe: 'Cucumber, white vinegar, sugar, mustard seed, turmeric.',
      createdAt: stamp,
      updatedAt: stamp,
    },
    {
      id: uid(),
      kind: 'homemade',
      name: 'Fig jam',
      qty: 2,
      unit: 'jar',
      categoryId: 'cat-tins',
      locationId: 'loc-pantry',
      lowThreshold: 2,
      batchDate: offsetDate(-60),
      expiry: offsetDate(180),
      recipe: 'Figs, sugar, lemon juice. Water bath 10 min.',
      createdAt: stamp,
      updatedAt: stamp,
    },
    {
      id: uid(),
      kind: 'mealprep',
      name: 'Beef ragu',
      qty: 3,
      unit: 'container',
      categoryId: 'cat-frozen',
      locationId: 'loc-freezer',
      lowThreshold: 1,
      portions: 2,
      batchDate: offsetDate(-14),
      expiry: offsetDate(76),
      createdAt: stamp,
      updatedAt: stamp,
    },
    {
      id: uid(),
      kind: 'mealprep',
      name: 'Chicken & veg curry',
      qty: 1,
      unit: 'container',
      categoryId: 'cat-frozen',
      locationId: 'loc-freezer',
      lowThreshold: 2,
      portions: 2,
      batchDate: offsetDate(-40),
      expiry: offsetDate(50),
      createdAt: stamp,
      updatedAt: stamp,
    },
  );

  await db.items.bulkAdd(items);

  // A little spending history so the budget page has something to draw.
  const spends = [];
  for (let week = 0; week < 8; week++) {
    const base = new Date();
    base.setDate(base.getDate() - week * 7 - 1);
    spends.push({
      id: uid(),
      date: toISODate(base),
      amount: Math.round((180 + Math.sin(week) * 55 + week * 3) * 100) / 100,
      storeId: 'store-main',
      note: 'Weekly shop',
      createdAt: stamp,
    });
    if (week % 2 === 0) {
      const b2 = new Date(base);
      b2.setDate(b2.getDate() - 2);
      spends.push({
        id: uid(),
        date: toISODate(b2),
        amount: Math.round((38 + week * 2.5) * 100) / 100,
        storeId: 'store-market',
        note: 'Market top-up',
        createdAt: stamp,
      });
    }
  }
  await db.spends.bulkAdd(spends);

  // Price history for a couple of items, so the price tracker has a trend.
  const flour = items.find((i) => i.name === 'Plain flour');
  const milk = items.find((i) => i.name === 'Milk');
  const priceRows = [];
  for (let m = 5; m >= 0; m--) {
    const d = new Date();
    d.setMonth(d.getMonth() - m);
    if (flour) {
      priceRows.push({
        id: uid(),
        itemId: flour.id,
        name: flour.name,
        price: Math.round((2.6 + (5 - m) * 0.13) * 100) / 100,
        qty: 1,
        unit: 'kg',
        storeId: m % 3 === 0 ? 'store-bulk' : 'store-main',
        date: toISODate(d),
      });
    }
    if (milk) {
      priceRows.push({
        id: uid(),
        itemId: milk.id,
        name: milk.name,
        price: Math.round((2.75 + (5 - m) * 0.07) * 100) / 100,
        qty: 2,
        unit: 'L',
        storeId: 'store-main',
        date: toISODate(d),
      });
    }
  }
  await db.priceEntries.bulkAdd(priceRows);

  await db.settings.update('settings', { lastInventoryDate: offsetDate(-9) });

  // Several demo items are deliberately low or out; the grocery list should
  // already show them by the time the user first opens it.
  await syncAutoGrocery();
}

/** Wipes every table and re-seeds reference data. Used by Settings > Reset. */
export async function resetAll(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
  await ensureSeeded();
}
