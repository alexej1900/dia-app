# Total Carb Calculation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a photo-first entry point for creating a dish (camera/gallery chooser fires immediately, before any manual dish setup), and persist the "this ingredient's weight was an AI estimate" flag to the database so a saved dish's total can show whether it includes unverified estimates.

**Architecture:** Part A extracts the existing pick→resize→recognize pipeline out of `PhotoRecognitionButton.tsx` into a shared `captureAndRecognizeDishPhoto()` function, then calls it from both the existing button and a new auto-fired native chooser on `DishFormScreen`, reached via a new button on `DishesListScreen`. Part B adds an `is_estimated` column to `dish_items`, threads a real `isEstimated` value through the repository and calculation layers (replacing a hardcoded `false`), and surfaces a `hasEstimatedItems` summary flag on both the dish form's totals and the dish list's rows.

**Tech Stack:** Expo/React Native/TypeScript (app), `expo-image-picker`, `expo-image-manipulator` (using its `ImageManipulator.manipulate()` plain-function API, not the `useImageManipulator` hook — see Global Constraints), `expo-sqlite`, Jest.

## Global Constraints

- The photo-first entry point is a second button on `DishesListScreen` ("📷 Photograph a dish"); it navigates to `DishForm` with `{ autoTriggerPhoto: true }`, which fires a native `Alert.alert` chooser (Take Photo / Choose from Gallery / Cancel) immediately on mount.
- The pick/resize/recognize pipeline must exist as a single shared function, `captureAndRecognizeDishPhoto`, used by both the existing manual button and the new auto-trigger path — no duplicated picker/resize/recognize logic.
- `dish_items` gains `is_estimated INTEGER NOT NULL DEFAULT 0`. There is no migration system in this codebase (`schema.ts` only runs `CREATE TABLE IF NOT EXISTS`, which does not add columns to an already-existing table) — the column is added to the `CREATE TABLE` statement for fresh installs *and* via a defensive, idempotent `ALTER TABLE dish_items ADD COLUMN is_estimated ...` (swallowing only "duplicate column" errors) for pre-existing local databases.
- Per `AGENTS.md`: Expo has changed — this plan verified against the installed `expo-image-manipulator@57.0.8` package's own type declarations (`node_modules/expo-image-manipulator/build/ImageManipulator.d.ts` and `ImageManipulatorContext.d.ts`) that `ImageManipulator.manipulate(uri)` is a current, non-deprecated, non-hook function returning the same chainable `.resize().renderAsync()` context the existing code already uses via the `useImageManipulator` hook — only the older standalone `manipulateAsync` function is deprecated. Part A's extraction relies on this: hooks cannot be called from a plain async function, so the switch from the hook to `ImageManipulator.manipulate()` is what makes the extraction possible at all.
- No insulin-dose calculation is in scope (no dose formula exists anywhere in the 5-module roadmap). No backfill migration for pre-existing dishes is needed (the app is pre-launch; local dev dishes simply default to `is_estimated = 0`). No new "review estimated items before saving" gate beyond the existing per-row edit affordance and the new summary-level warning.
- Work happens on the current branch (`module-4-total-carb-calculation`), not `main`.

---

## File Structure

- **Modify** `src/db/schema.ts` — add `is_estimated` to `CREATE TABLE dish_items`; add a new exported `migrateSchema(db)` function.
- **Modify** `src/db/database.ts` — call `migrateSchema` during `openDatabase()`.
- **Modify** `__tests__/db/schema.test.ts` — cover the new column and the migration function.
- **Modify** `src/calculations/carbs.ts` — `DishItemForCalc` gains `isEstimated`; `DishTotals` gains `hasEstimatedItems`.
- **Modify** `__tests__/calculations/carbs.test.ts` — update existing fixtures, add `hasEstimatedItems` coverage.
- **Modify** `src/repositories/dishesRepo.ts` — thread `isEstimated` through `DishItemInput`, `DishItem`, `DishItemRow`, `loadItems`, `replaceItemsRaw`; add `hasEstimatedItems` to `DishSummary`/`listDishes`.
- **Modify** `__tests__/repositories/dishesRepo.test.ts` — update existing fixtures, add `isEstimated` round-trip and summary-flag coverage.
- **Create** `src/services/dishPhotoCapture.ts` — the shared pick→resize→recognize pipeline, extracted out of `PhotoRecognitionButton.tsx`.
- **Create** `__tests__/services/dishPhotoCapture.test.ts` — unit tests for the extracted pipeline against mocked `expo-image-picker`/`expo-image-manipulator`/service dependencies.
- **Modify** `src/screens/PhotoRecognitionButton.tsx` — becomes a thin UI wrapper around the shared pipeline.
- **Modify** `src/navigation/RootNavigator.tsx` — `DishForm` route params gain `autoTriggerPhoto?: boolean`.
- **Modify** `src/screens/DishesListScreen.tsx` — new "📷 Photograph a dish" button; list rows show a flag when `hasEstimatedItems`.
- **Modify** `src/screens/DishFormScreen.tsx` — auto-fires the native chooser when `autoTriggerPhoto` is set; `handleSave`/the dish-loading effect use real `isEstimated`; totals show a warning when `hasEstimatedItems`.

---

### Task 1: Schema migration for `is_estimated`

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/db/database.ts`
- Test: `__tests__/db/schema.test.ts`

**Interfaces:**
- Consumes: `SqlExecutor` from `src/db/sqlExecutor.ts` (existing).
- Produces: `SCHEMA_SQL` (existing export, `dish_items` now includes `is_estimated`); new export `migrateSchema(db: SqlExecutor): Promise<void>`. Task 3 (repository layer) relies on the column existing; no other task calls `migrateSchema` directly.

- [ ] **Step 1: Write the failing tests**

Add to `__tests__/db/schema.test.ts`. First add the import at the top of the file:

```ts
import { createTestDatabase } from '../../src/testUtils/createTestDatabase';
import { migrateSchema } from '../../src/db/schema';
```

Then add these three tests inside the existing `describe('database schema', ...)` block, after the existing three tests:

```ts
  it('has the is_estimated column on dish_items after a fresh create', async () => {
    const db = await createTestDatabase();
    const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(dish_items)');
    expect(columns.map((c) => c.name)).toContain('is_estimated');
  });

  it('migrateSchema adds is_estimated to a pre-existing dish_items table that lacks it', async () => {
    const db = await createTestDatabase();
    // Simulate a database created before is_estimated existed.
    await db.execAsync('DROP TABLE dish_items');
    await db.execAsync(`
      CREATE TABLE dish_items (
        dish_id TEXT NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
        product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        grams REAL NOT NULL CHECK (grams > 0),
        PRIMARY KEY (dish_id, product_id)
      );
    `);
    const before = await db.getAllAsync<{ name: string }>('PRAGMA table_info(dish_items)');
    expect(before.map((c) => c.name)).not.toContain('is_estimated');

    await migrateSchema(db);

    const after = await db.getAllAsync<{ name: string }>('PRAGMA table_info(dish_items)');
    expect(after.map((c) => c.name)).toContain('is_estimated');
  });

  it('migrateSchema is a no-op that does not throw when is_estimated already exists', async () => {
    const db = await createTestDatabase();
    await expect(migrateSchema(db)).resolves.not.toThrow();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/db/schema.test.ts`
Expected: FAIL — `migrateSchema` doesn't exist yet (module has no such export), and the fresh-create test fails because `is_estimated` isn't in `dish_items` yet.

- [ ] **Step 3: Implement the schema change and migration function**

Replace the full contents of `src/db/schema.ts`:

```ts
import { SqlExecutor } from './sqlExecutor';

export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  carbs_per_100g REAL NOT NULL CHECK (carbs_per_100g >= 0),
  is_seed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dishes (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dish_items (
  dish_id TEXT NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  grams REAL NOT NULL CHECK (grams > 0),
  is_estimated INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (dish_id, product_id)
);
`;

// dish_items may already exist from before is_estimated was introduced — CREATE TABLE
// IF NOT EXISTS above won't add a column to an already-existing table, so add it here
// defensively. Swallows only "duplicate column" errors; anything else is a real failure.
export async function migrateSchema(db: SqlExecutor): Promise<void> {
  try {
    await db.execAsync('ALTER TABLE dish_items ADD COLUMN is_estimated INTEGER NOT NULL DEFAULT 0');
  } catch (e) {
    if (!(e instanceof Error) || !/duplicate column/i.test(e.message)) {
      throw e;
    }
  }
}
```

Replace the full contents of `src/db/database.ts`:

```ts
import * as SQLite from 'expo-sqlite';
import { SCHEMA_SQL, migrateSchema } from './schema';
import { SqlExecutor } from './sqlExecutor';
import { seedIfEmpty } from './seed';

let dbPromise: Promise<SqlExecutor> | null = null;

export function openDatabase(): Promise<SqlExecutor> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('diaapp.db');
      await db.execAsync(SCHEMA_SQL);
      await migrateSchema(db as SqlExecutor);
      await seedIfEmpty(db as SqlExecutor);
      return db as SqlExecutor;
    })();
  }
  return dbPromise;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/db/schema.test.ts`
Expected: PASS, all 6 tests in the file green (3 pre-existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts src/db/database.ts __tests__/db/schema.test.ts
git commit -m "feat: add is_estimated column and defensive migration to dish_items"
```

---

### Task 2: `hasEstimatedItems` in the calculation layer

**Files:**
- Modify: `src/calculations/carbs.ts`
- Test: `__tests__/calculations/carbs.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `DishItemForCalc` (exported) gains required field `isEstimated: boolean`. `DishTotals` (exported) gains `hasEstimatedItems: boolean`. `dishTotals(items: DishItemForCalc[]): DishTotals` is unchanged in signature but now requires `isEstimated` on every input item. Task 3's `dishesRepo.ts` and Task 7's `DishFormScreen.tsx` both call `dishTotals` and must supply `isEstimated` on every item passed in.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `__tests__/calculations/carbs.test.ts`:

```ts
import { carbsToW, gramsPerW, dishTotals } from '../../src/calculations/carbs';

describe('carbsToW', () => {
  it('converts grams of carbs to W units using 10g per W', () => {
    expect(carbsToW(50)).toBe(5);
    expect(carbsToW(0)).toBe(0);
    expect(carbsToW(25)).toBe(2.5);
  });
});

describe('gramsPerW', () => {
  it('returns grams of product containing 1 W of carbs', () => {
    expect(gramsPerW(50)).toBe(20);
    expect(gramsPerW(10)).toBe(100);
  });

  it('returns null when carbsPer100g is zero or negative', () => {
    expect(gramsPerW(0)).toBeNull();
    expect(gramsPerW(-5)).toBeNull();
  });
});

describe('dishTotals', () => {
  it('sums weight and carbs across items and converts to W', () => {
    const totals = dishTotals([
      { carbsPer100g: 50, grams: 100, isEstimated: false },
      { carbsPer100g: 20, grams: 50, isEstimated: false },
    ]);
    expect(totals.totalWeight).toBe(150);
    expect(totals.totalCarbs).toBe(60);
    expect(totals.totalW).toBe(6);
    expect(totals.hasEstimatedItems).toBe(false);
  });

  it('returns zeros and hasEstimatedItems false for an empty item list', () => {
    expect(dishTotals([])).toEqual({ totalWeight: 0, totalCarbs: 0, totalW: 0, hasEstimatedItems: false });
  });

  it('flags hasEstimatedItems true when any item is estimated', () => {
    const totals = dishTotals([
      { carbsPer100g: 50, grams: 100, isEstimated: false },
      { carbsPer100g: 20, grams: 50, isEstimated: true },
    ]);
    expect(totals.hasEstimatedItems).toBe(true);
  });

  it('flags hasEstimatedItems false when no item is estimated', () => {
    const totals = dishTotals([{ carbsPer100g: 50, grams: 100, isEstimated: false }]);
    expect(totals.hasEstimatedItems).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/calculations/carbs.test.ts`
Expected: FAIL — `isEstimated` doesn't exist on `DishItemForCalc` yet (ts-jest type error), and `hasEstimatedItems` isn't in the returned object.

- [ ] **Step 3: Implement the calculation change**

Replace the full contents of `src/calculations/carbs.ts`:

```ts
export const GRAMS_PER_W = 10;

export function carbsToW(carbsGrams: number): number {
  return carbsGrams / GRAMS_PER_W;
}

export function gramsPerW(carbsPer100g: number): number | null {
  if (carbsPer100g <= 0) return null;
  return (GRAMS_PER_W * 100) / carbsPer100g;
}

export interface DishItemForCalc {
  carbsPer100g: number;
  grams: number;
  isEstimated: boolean;
}

export interface DishTotals {
  totalWeight: number;
  totalCarbs: number;
  totalW: number;
  hasEstimatedItems: boolean;
}

export function dishTotals(items: DishItemForCalc[]): DishTotals {
  const totalWeight = items.reduce((sum, i) => sum + i.grams, 0);
  const totalCarbs = items.reduce((sum, i) => sum + (i.carbsPer100g * i.grams) / 100, 0);
  const hasEstimatedItems = items.some((i) => i.isEstimated);
  return { totalWeight, totalCarbs, totalW: carbsToW(totalCarbs), hasEstimatedItems };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/calculations/carbs.test.ts`
Expected: PASS, all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/calculations/carbs.ts __tests__/calculations/carbs.test.ts
git commit -m "feat: add hasEstimatedItems to dish carb totals"
```

---

### Task 3: Thread `isEstimated` through the dish repository

**Files:**
- Modify: `src/repositories/dishesRepo.ts`
- Test: `__tests__/repositories/dishesRepo.test.ts`

**Interfaces:**
- Consumes: `dishTotals`, `DishItemForCalc` (Task 2, both now require/produce `isEstimated`/`hasEstimatedItems`). Requires Task 1's `is_estimated` column to exist on `dish_items`.
- Produces: `DishItemInput` (exported) gains required `isEstimated: boolean`. `DishItem` (exported) gains required `isEstimated: boolean`. `DishSummary` (exported) gains `hasEstimatedItems: boolean`. `createDish`/`updateDish`/`getDish`/`listDishes` signatures are unchanged (only the item/summary shapes they consume/produce change). Task 7's `DishFormScreen.tsx` must supply `isEstimated` on every `DishItemInput` it builds, and consumes `isEstimated` on every `DishItem` it reads back.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `__tests__/repositories/dishesRepo.test.ts`:

```ts
import { createTestDatabase } from '../../src/testUtils/createTestDatabase';
import { createProduct } from '../../src/repositories/productsRepo';
import { createDish, updateDish, deleteDish, getDish, listDishes } from '../../src/repositories/dishesRepo';
import { SqlExecutor } from '../../src/db/sqlExecutor';

describe('dishesRepo', () => {
  let db: SqlExecutor;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  it('creates a dish with ingredients and computes totals', async () => {
    const bread = await createProduct(db, { name: 'Bread', carbsPer100g: 50 });
    const cheese = await createProduct(db, { name: 'Cheese', carbsPer100g: 2 });

    const dish = await createDish(db, {
      name: 'Toast with cheese',
      items: [
        { productId: bread.id, grams: 100, isEstimated: false },
        { productId: cheese.id, grams: 50, isEstimated: false },
      ],
    });

    expect(dish.items).toHaveLength(2);
    expect(dish.totals.totalWeight).toBe(150);
    expect(dish.totals.totalCarbs).toBe(51);
    expect(dish.totals.totalW).toBe(5.1);
    expect(dish.totals.hasEstimatedItems).toBe(false);
  });

  it('rejects creating a dish with no ingredients', async () => {
    await expect(createDish(db, { name: 'Empty', items: [] })).rejects.toThrow(
      'A dish must have at least one ingredient'
    );
  });

  it('updates a dish, replacing its ingredient list', async () => {
    const rice = await createProduct(db, { name: 'Rice', carbsPer100g: 28 });
    const dish = await createDish(db, {
      name: 'Rice bowl',
      items: [{ productId: rice.id, grams: 200, isEstimated: false }],
    });

    const beans = await createProduct(db, { name: 'Beans', carbsPer100g: 20 });
    await updateDish(db, dish.id, {
      name: 'Rice and beans',
      items: [
        { productId: rice.id, grams: 150, isEstimated: false },
        { productId: beans.id, grams: 100, isEstimated: false },
      ],
    });

    const updated = await getDish(db, dish.id);
    expect(updated?.name).toBe('Rice and beans');
    expect(updated?.items).toHaveLength(2);
    expect(updated?.totals.totalCarbs).toBe(62);
  });

  it('deletes a dish and its ingredient rows', async () => {
    const rice = await createProduct(db, { name: 'Rice', carbsPer100g: 28 });
    const dish = await createDish(db, {
      name: 'Rice bowl',
      items: [{ productId: rice.id, grams: 200, isEstimated: false }],
    });

    await deleteDish(db, dish.id);

    expect(await getDish(db, dish.id)).toBeNull();
    const remainingItems = await db.getAllAsync('SELECT * FROM dish_items WHERE dish_id = ?', [dish.id]);
    expect(remainingItems).toHaveLength(0);
  });

  it('lists dishes filtered by search term, with totals', async () => {
    const rice = await createProduct(db, { name: 'Rice', carbsPer100g: 28 });
    await createDish(db, { name: 'Rice bowl', items: [{ productId: rice.id, grams: 100, isEstimated: false }] });
    await createDish(db, { name: 'Salad', items: [{ productId: rice.id, grams: 50, isEstimated: false }] });

    const results = await listDishes(db, 'rice');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Rice bowl');
    expect(results[0].totalWeight).toBe(100);
    expect(results[0].totalCarbs).toBe(28);
    expect(results[0].totalW).toBe(2.8);
    expect(results[0].hasEstimatedItems).toBe(false);
  });

  it('rolls back on duplicate productId in items', async () => {
    const rice = await createProduct(db, { name: 'Rice', carbsPer100g: 28 });
    const dishesBefore = await db.getAllAsync('SELECT * FROM dishes');
    expect(dishesBefore).toHaveLength(0);

    await expect(
      createDish(db, {
        name: 'Broken dish',
        items: [
          { productId: rice.id, grams: 100, isEstimated: false },
          { productId: rice.id, grams: 50, isEstimated: false },
        ],
      })
    ).rejects.toThrow();

    const dishesAfter = await db.getAllAsync('SELECT * FROM dishes');
    expect(dishesAfter).toHaveLength(0);
  });

  it('persists and round-trips the isEstimated flag per ingredient', async () => {
    const rice = await createProduct(db, { name: 'Rice', carbsPer100g: 28 });
    const beans = await createProduct(db, { name: 'Beans', carbsPer100g: 20 });

    const dish = await createDish(db, {
      name: 'Mixed bowl',
      items: [
        { productId: rice.id, grams: 100, isEstimated: true },
        { productId: beans.id, grams: 50, isEstimated: false },
      ],
    });

    const riceItem = dish.items.find((item) => item.productId === rice.id);
    const beansItem = dish.items.find((item) => item.productId === beans.id);
    expect(riceItem?.isEstimated).toBe(true);
    expect(beansItem?.isEstimated).toBe(false);
    expect(dish.totals.hasEstimatedItems).toBe(true);

    const reloaded = await getDish(db, dish.id);
    expect(reloaded?.items.find((item) => item.productId === rice.id)?.isEstimated).toBe(true);
  });

  it('lists a dish summary flagged when it has any estimated ingredient', async () => {
    const rice = await createProduct(db, { name: 'Rice', carbsPer100g: 28 });
    await createDish(db, {
      name: 'Estimated bowl',
      items: [{ productId: rice.id, grams: 100, isEstimated: true }],
    });

    const results = await listDishes(db, 'Estimated bowl');
    expect(results[0].hasEstimatedItems).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/repositories/dishesRepo.test.ts`
Expected: FAIL — `isEstimated` doesn't exist on `DishItemInput` yet (ts-jest type error on every item literal), and the two new tests fail because the flag isn't persisted/read yet.

- [ ] **Step 3: Implement the repository changes**

In `src/repositories/dishesRepo.ts`, replace the `DishItemInput` interface:

```ts
export interface DishItemInput {
  productId: string;
  grams: number;
  isEstimated: boolean;
}
```

Replace the `DishItem` interface:

```ts
export interface DishItem {
  productId: string;
  productName: string;
  carbsPer100g: number;
  grams: number;
  isEstimated: boolean;
}
```

Replace the `DishSummary` interface:

```ts
export interface DishSummary {
  id: string;
  name: string;
  totalWeight: number;
  totalCarbs: number;
  totalW: number;
  hasEstimatedItems: boolean;
}
```

Replace the `DishItemRow` interface:

```ts
interface DishItemRow {
  product_id: string;
  name: string;
  carbs_per_100g: number;
  grams: number;
  is_estimated: number;
}
```

Replace the `loadItems` function:

```ts
async function loadItems(db: SqlExecutor, dishId: string): Promise<DishItem[]> {
  const rows = await db.getAllAsync<DishItemRow>(
    `SELECT dish_items.product_id AS product_id, products.name AS name,
            products.carbs_per_100g AS carbs_per_100g, dish_items.grams AS grams,
            dish_items.is_estimated AS is_estimated
     FROM dish_items
     JOIN products ON products.id = dish_items.product_id
     WHERE dish_items.dish_id = ?
     ORDER BY products.name COLLATE NOCASE`,
    [dishId]
  );
  return rows.map((row) => ({
    productId: row.product_id,
    productName: row.name,
    carbsPer100g: row.carbs_per_100g,
    grams: row.grams,
    isEstimated: row.is_estimated === 1,
  }));
}
```

Replace the `replaceItemsRaw` function:

```ts
async function replaceItemsRaw(db: SqlExecutor, dishId: string, items: DishItemInput[]): Promise<void> {
  await db.runAsync('DELETE FROM dish_items WHERE dish_id = ?', [dishId]);
  for (const item of items) {
    await db.runAsync('INSERT INTO dish_items (dish_id, product_id, grams, is_estimated) VALUES (?, ?, ?, ?)', [
      dishId,
      item.productId,
      item.grams,
      item.isEstimated ? 1 : 0,
    ]);
  }
}
```

In `listDishes`, replace the summary-building loop body:

```ts
  const summaries: DishSummary[] = [];
  for (const row of rows) {
    const items = await loadItems(db, row.id);
    const totals = dishTotals(items);
    summaries.push({
      id: row.id,
      name: row.name,
      totalWeight: totals.totalWeight,
      totalCarbs: totals.totalCarbs,
      totalW: totals.totalW,
      hasEstimatedItems: totals.hasEstimatedItems,
    });
  }
```

`getDish`, `createDish`, and `updateDish` need no code changes — they already pass `items`/`input.items` through to `loadItems`/`replaceItemsRaw`/`dishTotals` by reference, and those now carry `isEstimated` automatically once the interfaces above are updated.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/repositories/dishesRepo.test.ts`
Expected: PASS, all 9 tests green (7 pre-existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/repositories/dishesRepo.ts __tests__/repositories/dishesRepo.test.ts
git commit -m "feat: persist and surface the isEstimated flag per dish ingredient"
```

---

### Task 4: Extract the shared photo capture/recognize pipeline

**Files:**
- Create: `src/services/dishPhotoCapture.ts`
- Test: `__tests__/services/dishPhotoCapture.test.ts`

**Interfaces:**
- Consumes: `openDatabase` (`src/db/database.ts`), `listProducts` (`src/repositories/productsRepo.ts`), `recognizeDish`/`RecognizedItem`/`DishRecognitionError` (`src/services/dishRecognition.ts`) — all pre-existing.
- Produces: `captureAndRecognizeDishPhoto(source: 'camera' | 'gallery'): Promise<RecognizedItem[]>`, `PhotoPermissionDeniedError` (extends `Error`), `PhotoPickCancelledError` (extends `Error`) — all exported from `src/services/dishPhotoCapture.ts`. Task 5 (`PhotoRecognitionButton.tsx`) and Task 7 (`DishFormScreen.tsx`) both import and call this function and catch `PhotoPickCancelledError` specifically to distinguish "user cancelled" (no error shown) from a genuine failure.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/services/dishPhotoCapture.test.ts`:

```ts
import {
  captureAndRecognizeDishPhoto,
  PhotoPermissionDeniedError,
  PhotoPickCancelledError,
} from '../../src/services/dishPhotoCapture';

const requestCameraPermissionsAsync = jest.fn();
const requestMediaLibraryPermissionsAsync = jest.fn();
const launchCameraAsync = jest.fn();
const launchImageLibraryAsync = jest.fn();

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: (...args: unknown[]) => requestCameraPermissionsAsync(...args),
  requestMediaLibraryPermissionsAsync: (...args: unknown[]) => requestMediaLibraryPermissionsAsync(...args),
  launchCameraAsync: (...args: unknown[]) => launchCameraAsync(...args),
  launchImageLibraryAsync: (...args: unknown[]) => launchImageLibraryAsync(...args),
}));

const renderAsync = jest.fn();
const resize = jest.fn(() => ({ renderAsync }));
const manipulate = jest.fn(() => ({ resize }));

jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: (...args: unknown[]) => manipulate(...args) },
  SaveFormat: { JPEG: 'jpeg' },
}));

const openDatabase = jest.fn();
jest.mock('../../src/db/database', () => ({
  openDatabase: (...args: unknown[]) => openDatabase(...args),
}));

const listProducts = jest.fn();
jest.mock('../../src/repositories/productsRepo', () => ({
  listProducts: (...args: unknown[]) => listProducts(...args),
}));

class DishRecognitionError extends Error {}
const recognizeDish = jest.fn();
jest.mock('../../src/services/dishRecognition', () => ({
  recognizeDish: (...args: unknown[]) => recognizeDish(...args),
  DishRecognitionError,
}));

describe('captureAndRecognizeDishPhoto', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    openDatabase.mockResolvedValue({});
    listProducts.mockResolvedValue([{ name: 'Rice' }, { name: 'Beans' }]);
    const saveAsync = jest.fn().mockResolvedValue({ base64: 'abc123' });
    renderAsync.mockResolvedValue({ saveAsync });
    recognizeDish.mockResolvedValue([{ name: 'Rice', matchedProductName: 'Rice', estimatedGrams: 100 }]);
  });

  it('requests camera permission and picks via the camera for source "camera"', async () => {
    requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
    launchCameraAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://photo.jpg', width: 800, height: 600 }],
    });

    const items = await captureAndRecognizeDishPhoto('camera');

    expect(requestCameraPermissionsAsync).toHaveBeenCalled();
    expect(launchCameraAsync).toHaveBeenCalled();
    expect(launchImageLibraryAsync).not.toHaveBeenCalled();
    expect(items).toEqual([{ name: 'Rice', matchedProductName: 'Rice', estimatedGrams: 100 }]);
  });

  it('requests media library permission and picks via the gallery for source "gallery"', async () => {
    requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
    launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://photo.jpg', width: 600, height: 800 }],
    });

    await captureAndRecognizeDishPhoto('gallery');

    expect(requestMediaLibraryPermissionsAsync).toHaveBeenCalled();
    expect(launchImageLibraryAsync).toHaveBeenCalled();
    expect(launchCameraAsync).not.toHaveBeenCalled();
  });

  it('resizes by width when the image is wider than tall', async () => {
    requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
    launchCameraAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://photo.jpg', width: 1600, height: 900 }],
    });

    await captureAndRecognizeDishPhoto('camera');

    expect(manipulate).toHaveBeenCalledWith('file://photo.jpg');
    expect(resize).toHaveBeenCalledWith({ width: 1024 });
  });

  it('resizes by height when the image is taller than wide', async () => {
    requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
    launchCameraAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://photo.jpg', width: 900, height: 1600 }],
    });

    await captureAndRecognizeDishPhoto('camera');

    expect(resize).toHaveBeenCalledWith({ height: 1024 });
  });

  it('throws PhotoPermissionDeniedError when permission is denied', async () => {
    requestCameraPermissionsAsync.mockResolvedValue({ granted: false });

    await expect(captureAndRecognizeDishPhoto('camera')).rejects.toThrow(PhotoPermissionDeniedError);
    expect(launchCameraAsync).not.toHaveBeenCalled();
  });

  it('throws PhotoPickCancelledError when the picker is cancelled', async () => {
    requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
    launchCameraAsync.mockResolvedValue({ canceled: true, assets: [] });

    await expect(captureAndRecognizeDishPhoto('camera')).rejects.toThrow(PhotoPickCancelledError);
  });

  it('throws PhotoPickCancelledError when no assets are returned', async () => {
    requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
    launchCameraAsync.mockResolvedValue({ canceled: false, assets: [] });

    await expect(captureAndRecognizeDishPhoto('camera')).rejects.toThrow(PhotoPickCancelledError);
  });

  it('throws DishRecognitionError when the manipulator produces no base64 data', async () => {
    requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
    launchCameraAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://photo.jpg', width: 800, height: 600 }],
    });
    const saveAsync = jest.fn().mockResolvedValue({ base64: undefined });
    renderAsync.mockResolvedValue({ saveAsync });

    await expect(captureAndRecognizeDishPhoto('camera')).rejects.toThrow(DishRecognitionError);
  });

  it('passes the resized base64 image and product names to recognizeDish', async () => {
    requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
    launchCameraAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://photo.jpg', width: 800, height: 600 }],
    });

    await captureAndRecognizeDishPhoto('camera');

    expect(recognizeDish).toHaveBeenCalledWith('abc123', ['Rice', 'Beans']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/services/dishPhotoCapture.test.ts`
Expected: FAIL — `src/services/dishPhotoCapture.ts` doesn't exist yet (module not found).

- [ ] **Step 3: Implement the shared pipeline**

Create `src/services/dishPhotoCapture.ts`:

```ts
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { openDatabase } from '../db/database';
import { listProducts } from '../repositories/productsRepo';
import { recognizeDish, RecognizedItem, DishRecognitionError } from './dishRecognition';

export class PhotoPermissionDeniedError extends Error {}
export class PhotoPickCancelledError extends Error {}

export async function captureAndRecognizeDishPhoto(source: 'camera' | 'gallery'): Promise<RecognizedItem[]> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new PhotoPermissionDeniedError('Camera/photo access is needed for this feature.');
  }

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
  if (result.canceled || result.assets.length === 0) {
    throw new PhotoPickCancelledError('No photo was selected.');
  }
  const asset = result.assets[0];

  // Cap the longest edge at ~1024px, scaling the other dimension proportionally,
  // regardless of orientation.
  const resizeOptions = asset.width >= asset.height ? { width: 1024 } : { height: 1024 };
  const rendered = await ImageManipulator.manipulate(asset.uri).resize(resizeOptions).renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  if (!saved.base64) {
    throw new DishRecognitionError('Could not process the photo.');
  }

  const db = await openDatabase();
  const productNames = (await listProducts(db, '')).map((p) => p.name);
  return recognizeDish(saved.base64, productNames);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/services/dishPhotoCapture.test.ts`
Expected: PASS, all 9 tests green.

- [ ] **Step 5: Type-check the app**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/services/dishPhotoCapture.ts __tests__/services/dishPhotoCapture.test.ts
git commit -m "feat: extract shared dish photo capture/recognize pipeline"
```

---

### Task 5: Simplify `PhotoRecognitionButton` to use the shared pipeline

**Files:**
- Modify: `src/screens/PhotoRecognitionButton.tsx`

**Interfaces:**
- Consumes: `captureAndRecognizeDishPhoto`, `PhotoPickCancelledError` (Task 4).
- Produces: no change to this component's own exported `Props` (`{ onRecognized: (items: RecognizedItem[]) => void }`) — behavior is unchanged from the outside, only the internal implementation is simplified.

This component has no dedicated automated test in this codebase (no RN test environment configured — screens are verified via `tsc --noEmit` and the full Jest suite staying green). Task 4's tests already cover the extracted pipeline's behavior.

- [ ] **Step 1: Replace the component**

Replace the full contents of `src/screens/PhotoRecognitionButton.tsx`:

```tsx
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { RecognizedItem } from '../services/dishRecognition';
import { captureAndRecognizeDishPhoto, PhotoPickCancelledError } from '../services/dishPhotoCapture';

interface Props {
  onRecognized: (items: RecognizedItem[]) => void;
}

export default function PhotoRecognitionButton({ onRecognized }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickFrom = async (source: 'camera' | 'gallery') => {
    setError(null);
    setLoading(true);
    try {
      const items = await captureAndRecognizeDishPhoto(source);
      onRecognized(items);
    } catch (e) {
      if (!(e instanceof PhotoPickCancelledError)) {
        setError(e instanceof Error ? e.message : 'Recognition failed. Try again or add ingredients manually.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.button} onPress={() => pickFrom('camera')} disabled={loading}>
          <Text style={styles.buttonText}>Take Photo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={() => pickFrom('gallery')} disabled={loading}>
          <Text style={styles.buttonText}>Choose from Gallery</Text>
        </TouchableOpacity>
      </View>
      {loading && <ActivityIndicator style={styles.loading} />}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 12 },
  buttonRow: { flexDirection: 'row', gap: 8 },
  button: { flex: 1, borderWidth: 1, borderColor: '#2e7d32', borderRadius: 8, padding: 10, alignItems: 'center' },
  buttonText: { color: '#2e7d32', fontWeight: '600' },
  loading: { marginTop: 8 },
  error: { color: '#c62828', marginTop: 8 },
});
```

- [ ] **Step 2: Type-check and run the full test suite as a regression check**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx jest`
Expected: PASS, all suites green.

- [ ] **Step 3: Commit**

```bash
git add src/screens/PhotoRecognitionButton.tsx
git commit -m "refactor: simplify PhotoRecognitionButton to use the shared capture pipeline"
```

---

### Task 6: Photo-first entry button and estimate flag on the dish list

**Files:**
- Modify: `src/navigation/RootNavigator.tsx`
- Modify: `src/screens/DishesListScreen.tsx`

**Interfaces:**
- Consumes: `DishSummary.hasEstimatedItems` (Task 3).
- Produces: `DishesStackParamList['DishForm']` gains `autoTriggerPhoto?: boolean`. Task 7's `DishFormScreen.tsx` reads `route.params?.autoTriggerPhoto`.

No dedicated automated test (no RN test environment configured for screens/navigation types). Verified via `tsc --noEmit` and the full Jest suite as a regression check.

- [ ] **Step 1: Widen the navigation param type**

In `src/navigation/RootNavigator.tsx`, replace the `DishesStackParamList` type:

```ts
export type DishesStackParamList = {
  DishesList: undefined;
  DishForm: { dishId?: string; autoTriggerPhoto?: boolean };
  PhotoReview: PhotoReviewParams;
  ProductForm: ProductFormParams;
};
```

- [ ] **Step 2: Add the entry button and estimate flag to DishesListScreen**

In `src/screens/DishesListScreen.tsx`, replace the `renderItem` prop of the `FlatList`:

```tsx
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('DishForm', { dishId: item.id })}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.detail}>
              {item.totalWeight} g · {item.totalCarbs.toFixed(1)} g carbs · {item.totalW.toFixed(1)} W
            </Text>
            {item.hasEstimatedItems && <Text style={styles.estimatedFlag}>⚠ includes unverified estimates</Text>}
          </TouchableOpacity>
        )}
```

Replace the block containing the "+ Add dish" button:

```tsx
      <TouchableOpacity style={styles.addButton} onPress={() => navigation.navigate('DishForm', {})}>
        <Text style={styles.addButtonText}>+ Add dish</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.photoButton}
        onPress={() => navigation.navigate('DishForm', { autoTriggerPhoto: true })}
      >
        <Text style={styles.photoButtonText}>📷 Photograph a dish</Text>
      </TouchableOpacity>
```

Add three new entries to the `StyleSheet.create` call, alongside the existing `addButton`/`addButtonText`:

```ts
  photoButton: { marginTop: 8, backgroundColor: '#2e7d32', borderRadius: 8, padding: 12, alignItems: 'center' },
  photoButtonText: { color: '#fff', fontWeight: '600' },
  estimatedFlag: { fontSize: 12, color: '#b26a00', marginTop: 2 },
```

- [ ] **Step 3: Type-check and run the full test suite as a regression check**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx jest`
Expected: PASS, all suites green.

- [ ] **Step 4: Commit**

```bash
git add src/navigation/RootNavigator.tsx src/screens/DishesListScreen.tsx
git commit -m "feat: add photo-first entry button and estimate flag to the dish list"
```

---

### Task 7: Wire auto-trigger and real isEstimated persistence into DishFormScreen

**Files:**
- Modify: `src/screens/DishFormScreen.tsx`

**Interfaces:**
- Consumes: `captureAndRecognizeDishPhoto`, `PhotoPickCancelledError` (Task 4); `DishItemInput.isEstimated`, `DishItem.isEstimated` (Task 3); `DishTotals.hasEstimatedItems` (Task 2); `route.params?.autoTriggerPhoto` (Task 6).
- Produces: no new exports — this is the top of the chain (screen).

No dedicated automated test (no RN test environment configured for screens). Verified via `tsc --noEmit` and the full Jest suite as a regression check — the logic this task calls into (Tasks 2-4) is already covered by unit tests.

- [ ] **Step 1: Add the Alert and capture imports**

In `src/screens/DishFormScreen.tsx`, replace the top-of-file import block:

```tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { openDatabase } from '../db/database';
import { listProducts, Product } from '../repositories/productsRepo';
import { createDish, updateDish, deleteDish, getDish } from '../repositories/dishesRepo';
import { dishTotals } from '../calculations/carbs';
import PhotoRecognitionButton from './PhotoRecognitionButton';
import type { RecognizedItem } from '../services/dishRecognition';
import type { DishesStackParamList } from '../navigation/RootNavigator';
import { buildIngredientRow, applyGramsEdit, IngredientRow } from './dishFormHelpers';
import { captureAndRecognizeDishPhoto, PhotoPickCancelledError } from '../services/dishPhotoCapture';
```

- [ ] **Step 2: Add the auto-trigger state, handler, and effect**

Immediately after the existing `handleRecognized` function (which ends with the closing `};` right before the `useEffect` that watches `pendingUnmatchedNames`), insert:

```tsx
  const [autoCaptureLoading, setAutoCaptureLoading] = useState(false);
  const [autoCaptureError, setAutoCaptureError] = useState<string | null>(null);

  const runAutoCapture = async (source: 'camera' | 'gallery') => {
    setAutoCaptureError(null);
    setAutoCaptureLoading(true);
    try {
      const items = await captureAndRecognizeDishPhoto(source);
      handleRecognized(items);
    } catch (e) {
      if (!(e instanceof PhotoPickCancelledError)) {
        setAutoCaptureError(
          e instanceof Error ? e.message : 'Recognition failed. Try again or add ingredients manually.'
        );
      }
    } finally {
      setAutoCaptureLoading(false);
    }
  };

  useEffect(() => {
    if (!route.params?.autoTriggerPhoto) return;
    Alert.alert('Photograph a dish', undefined, [
      { text: 'Take Photo', onPress: () => runAutoCapture('camera') },
      { text: 'Choose from Gallery', onPress: () => runAutoCapture('gallery') },
      { text: 'Cancel', style: 'cancel' },
    ]);
    // Only ever auto-fire once, on this screen instance's initial mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

- [ ] **Step 3: Wire real isEstimated into the dish-loading effect**

In the `useEffect` that loads an existing dish (watches `[dishId]`), replace the hardcoded flag in the `setItems` call:

```tsx
        setItems(
          dish.items.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            carbsPer100g: item.carbsPer100g,
            gramsText: String(item.grams),
            isEstimated: item.isEstimated,
          }))
        );
```

- [ ] **Step 4: Include isEstimated in the totals computation**

Replace the `parsedItems`/`totals` block:

```tsx
  const parsedItems = items.map((item) => ({ ...item, grams: Number(item.gramsText) }));
  const totals = dishTotals(
    parsedItems
      .filter((item) => !Number.isNaN(item.grams) && item.grams > 0)
      .map((item) => ({ carbsPer100g: item.carbsPer100g, grams: item.grams, isEstimated: item.isEstimated }))
  );
```

- [ ] **Step 5: Persist isEstimated on save**

In `handleSave`, replace the `input` object:

```tsx
      const input = {
        name: name.trim(),
        items: parsedItems.map((item) => ({
          productId: item.productId,
          grams: item.grams,
          isEstimated: item.isEstimated,
        })),
      };
```

- [ ] **Step 6: Render the auto-capture loading/error state and the totals warning**

Replace the opening of the `ScrollView` (everything from `<ScrollView ...>` through the `PhotoRecognitionButton` line):

```tsx
      <ScrollView contentContainerStyle={styles.container}>
        {autoCaptureLoading && <ActivityIndicator style={styles.autoCaptureLoading} />}
        {autoCaptureError && <Text style={styles.error}>{autoCaptureError}</Text>}

        <Text style={styles.label}>Name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Rice bowl" />

        <Text style={styles.label}>Ingredients</Text>
        <PhotoRecognitionButton onRecognized={handleRecognized} />
```

Replace the totals `<Text>` block:

```tsx
        <Text style={styles.totals}>
          Total: {totals.totalWeight} g · {totals.totalCarbs.toFixed(1)} g carbs · {totals.totalW.toFixed(1)} W
        </Text>
        {totals.hasEstimatedItems && <Text style={styles.estimatedWarning}>⚠ includes unverified estimates</Text>}
```

- [ ] **Step 7: Add the new styles**

In the `StyleSheet.create` call, add two entries alongside the existing `totals`/`error` entries:

```ts
  autoCaptureLoading: { marginBottom: 12 },
  estimatedWarning: { color: '#b26a00', marginTop: 4, fontSize: 13 },
```

- [ ] **Step 8: Type-check and run the full test suite as a regression check**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx jest`
Expected: PASS, all suites green.

- [ ] **Step 9: Commit**

```bash
git add src/screens/DishFormScreen.tsx
git commit -m "feat: auto-trigger photo capture and persist isEstimated on dish save"
```

---

## Post-plan verification (not a task — do after Task 7)

Run `npx tsc --noEmit` and `npx jest` at the repo root, both green (this module touches no worker code, so `worker/` is unaffected and doesn't need re-verification). Live estimation quality still can't be exercised in this dev environment (no deployed Worker/API key — the same open gap Modules 2 and 3 left behind); the photo-first entry flow's wiring (button → auto-fired chooser → gallery pick → recognize → review → save with a real `isEstimated` value) can optionally be spot-checked via `expo start --web` + chrome-devtools MCP, the same approach used for prior modules. Note that React Native Web's `Alert.alert` polyfill does not render distinct custom buttons the way native `Alert.alert` does — only the gallery half of the chooser is meaningfully exercisable on web, consistent with the native-camera-capture gap already open from Module 2.
