import { db } from './schema';
import type { Category } from '@/domain/types';

/**
 * One-way data migrations for databases that were seeded by an earlier version.
 *
 * `ensureSeeded()` deliberately does nothing once `seeded` is set, so changing
 * the seed arrays only ever affects brand-new databases. Anything that has to
 * reach existing data belongs here instead.
 *
 * Every step must be safe to run against a database that has already had it
 * applied, because the version stamp is written last and a tab closed mid-way
 * will run the whole batch again.
 */

export const SCHEMA_VERSION = 3;

/**
 * Categories folded into Pantry Staples in v2.
 *
 * `cat-spices` was in this list when v2 shipped and has since been removed:
 * Herbs & Spices came back as its own category in v3. Taking it out here means
 * a database that has not run v2 yet never loses its spice assignments at all,
 * which is strictly better than merging them and recreating an empty category
 * a moment later.
 *
 * A database that already ran the shipped v2 is a different matter -- see
 * `restoreSpices()`.
 */
const MERGED_INTO_PANTRY = ['cat-tins', 'cat-baking'];

const PANTRY = 'cat-pantry';

const SPICES = 'cat-spices';

/** Herbs & Spices, restored in v3. */
const SPICES_CATEGORY: Category = {
  id: SPICES,
  name: 'Herbs & Spices',
  department: 'Ambient',
  sortOrder: 70,
  icon: 'leaf',
  colour: '#84cc16',
};

/** Restored if the target category was deleted by hand before the merge. */
const PANTRY_FALLBACK: Category = {
  id: PANTRY,
  name: 'Pantry Staples',
  department: 'Ambient',
  sortOrder: 50,
  icon: 'wheat',
  colour: '#8b5cf6',
};

/** Backfill for databases seeded before categories had colours. */
const COLOURS: Record<string, string> = {
  'cat-produce': '#16a34a',
  'cat-meat': '#dc2626',
  'cat-dairy': '#2563eb',
  'cat-bakery': '#d97706',
  'cat-pantry': '#8b5cf6',
  'cat-spices': '#84cc16',
  'cat-snacks': '#db2777',
  'cat-drinks': '#0d9488',
  'cat-frozen': '#0ea5e9',
  'cat-household': '#64748b',
};

/**
 * Spread around the wheel so two categories added back to back do not come out
 * near-identical. Only used for categories with no colour and no known default.
 */
const FALLBACK_HUES = [12, 45, 95, 135, 175, 205, 250, 290, 320, 340];

function fallbackColour(index: number): string {
  return `hsl(${FALLBACK_HUES[index % FALLBACK_HUES.length]} 62% 45%)`;
}

export async function runMigrations(): Promise<void> {
  const settings = await db.settings.get('settings');

  // Guard only: `ensureSeeded()` runs first and always leaves a settings row, so
  // in the normal boot order this never fires. It matters if migrations are ever
  // called on their own -- there is nothing to migrate before the seed exists.
  if (!settings?.seeded) return;

  if ((settings.schemaVersion ?? 1) >= SCHEMA_VERSION) return;

  // A freshly seeded database is already in the current shape, so both steps
  // below no-op and this call simply stamps the version -- which is what stops
  // the migration being reconsidered on every subsequent boot.

  await db.transaction(
    'rw',
    [db.items, db.grocery, db.spends, db.categories, db.stores, db.settings],
    async () => {
      await mergeCategories();
      await restoreSpices();
      await backfillColours();
      await db.settings.update('settings', { schemaVersion: SCHEMA_VERSION });
    },
  );
}

/**
 * Folds Tins & Jars, Herbs & Spices and Baking into Pantry Staples.
 *
 * Rows are repointed *before* the old categories are deleted, so an interrupted
 * run leaves items pointing at a category that still exists rather than at a
 * dangling id.
 */
async function mergeCategories(): Promise<void> {
  const doomed = await db.categories.where('id').anyOf(MERGED_INTO_PANTRY).toArray();
  if (doomed.length === 0) return;

  // The merge target must exist before anything points at it.
  if (!(await db.categories.get(PANTRY))) {
    await db.categories.add(PANTRY_FALLBACK);
  }

  await db.items.where('categoryId').anyOf(MERGED_INTO_PANTRY).modify({ categoryId: PANTRY });
  await db.grocery.where('categoryId').anyOf(MERGED_INTO_PANTRY).modify({ categoryId: PANTRY });

  // `spends.categoryId` is optional and carries no index, so it has to be
  // walked rather than looked up.
  await db.spends
    .filter((s) => s.categoryId !== undefined && MERGED_INTO_PANTRY.includes(s.categoryId))
    .modify({ categoryId: PANTRY });

  // Aisle walk orders reference categories by id; drop the dead entries and
  // keep a single Pantry Staples stop at the earliest position they occupied.
  for (const store of await db.stores.toArray()) {
    if (!store.aisleOrder.some((id) => MERGED_INTO_PANTRY.includes(id))) continue;

    const firstMerged = store.aisleOrder.findIndex((id) => MERGED_INTO_PANTRY.includes(id));
    const kept = store.aisleOrder.filter((id) => !MERGED_INTO_PANTRY.includes(id));

    if (!kept.includes(PANTRY)) {
      kept.splice(Math.min(firstMerged, kept.length), 0, PANTRY);
    }
    await db.stores.update(store.id, { aisleOrder: kept });
  }

  await db.categories.bulkDelete(doomed.map((c) => c.id));
}

/**
 * Puts Herbs & Spices back as its own category (v3).
 *
 * Only the category is restored, never the items. A database that ran the
 * shipped v2 had its spice items rewritten to `cat-pantry` with no record of
 * where they came from, so there is nothing to reverse them from -- inventing
 * a rule like "anything in a jar" would silently move the wrong things, which
 * is worse than leaving them put. Those items stay in Pantry Staples until
 * they are reassigned by hand.
 *
 * Databases still on v1 keep their assignments outright: `cat-spices` is no
 * longer in `MERGED_INTO_PANTRY`, so it is never folded away in the first
 * place, and the add below is skipped because the category still exists.
 */
async function restoreSpices(): Promise<void> {
  if (await db.categories.get(SPICES)) return;
  await db.categories.add(SPICES_CATEGORY);

  // v2 also stripped the id out of every store's walk order. Without this the
  // category exists but sorts to the end of the grocery list, behind frozen.
  for (const store of await db.stores.toArray()) {
    if (store.aisleOrder.length === 0 || store.aisleOrder.includes(SPICES)) continue;

    const order = [...store.aisleOrder];
    const after = order.indexOf(PANTRY);
    order.splice(after === -1 ? order.length : after + 1, 0, SPICES);
    await db.stores.update(store.id, { aisleOrder: order });
  }
}

/** Gives every category a swatch colour, leaving any the user already set. */
async function backfillColours(): Promise<void> {
  const categories = await db.categories.orderBy('sortOrder').toArray();
  let spare = 0;

  for (const category of categories) {
    if (category.colour) continue;
    const colour = COLOURS[category.id] ?? fallbackColour(spare++);
    await db.categories.update(category.id, { colour });
  }
}
