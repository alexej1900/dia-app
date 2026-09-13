import { SqlExecutor } from '../db/sqlExecutor';
import { generateId } from '../utils/id';
import { dishTotals, carbsToW, DishTotals } from '../calculations/carbs';

export interface DishItemInput {
  productId: string;
  grams: number;
  isEstimated: boolean;
}

export interface DishInput {
  name: string;
  items: DishItemInput[];
  photoUri?: string | null;
}

export interface DishItem {
  productId: string;
  productName: string;
  productNameRu: string | null;
  carbsPer100g: number;
  grams: number;
  isEstimated: boolean;
}

export interface Dish {
  id: string;
  name: string;
  photoUri: string | null;
  items: DishItem[];
  totals: DishTotals;
  createdAt: string;
  updatedAt: string;
}

export interface DishSummary {
  id: string;
  name: string;
  photoUri: string | null;
  totalWeight: number;
  totalCarbs: number;
  totalW: number;
  hasEstimatedItems: boolean;
}

interface DishRow {
  id: string;
  name: string;
  photo_uri: string | null;
  created_at: string;
  updated_at: string;
}

interface DishItemRow {
  product_id: string;
  name: string;
  name_ru: string | null;
  carbs_per_100g: number;
  grams: number;
  is_estimated: number;
}

async function loadItems(db: SqlExecutor, dishId: string): Promise<DishItem[]> {
  const rows = await db.getAllAsync<DishItemRow>(
    `SELECT dish_items.product_id AS product_id, products.name AS name, products.name_ru AS name_ru,
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
    productNameRu: row.name_ru,
    carbsPer100g: row.carbs_per_100g,
    grams: row.grams,
    isEstimated: row.is_estimated === 1,
  }));
}

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

export async function createDish(db: SqlExecutor, input: DishInput): Promise<Dish> {
  if (input.items.length === 0) {
    throw new Error('A dish must have at least one ingredient');
  }
  const now = new Date().toISOString();
  const id = generateId();

  await db.withTransactionAsync(async () => {
    await db.runAsync('INSERT INTO dishes (id, name, photo_uri, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [
      id,
      input.name,
      input.photoUri ?? null,
      now,
      now,
    ]);
    await replaceItemsRaw(db, id, input.items);
  });

  const dish = await getDish(db, id);
  if (!dish) throw new Error('Failed to load dish after creation');
  return dish;
}

export async function updateDish(db: SqlExecutor, id: string, input: DishInput): Promise<void> {
  if (input.items.length === 0) {
    throw new Error('A dish must have at least one ingredient');
  }
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE dishes SET name = ?, photo_uri = ?, updated_at = ? WHERE id = ?', [
      input.name,
      input.photoUri ?? null,
      now,
      id,
    ]);
    await replaceItemsRaw(db, id, input.items);
  });
}

export async function deleteDish(db: SqlExecutor, id: string): Promise<void> {
  await db.runAsync('DELETE FROM dishes WHERE id = ?', [id]);
}

export async function getDish(db: SqlExecutor, id: string): Promise<Dish | null> {
  const row = await db.getFirstAsync<DishRow>('SELECT * FROM dishes WHERE id = ?', [id]);
  if (!row) return null;
  const items = await loadItems(db, id);
  return {
    id: row.id,
    name: row.name,
    photoUri: row.photo_uri,
    items,
    totals: dishTotals(items),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listDishes(db: SqlExecutor, searchTerm = ''): Promise<DishSummary[]> {
  const rows = await db.getAllAsync<{ id: string; name: string; photo_uri: string | null }>(
    `SELECT dishes.id AS id, dishes.name AS name, dishes.photo_uri AS photo_uri
     FROM dishes
     WHERE dishes.name LIKE ?
     ORDER BY dishes.name COLLATE NOCASE`,
    [`%${searchTerm}%`]
  );

  const summaries: DishSummary[] = [];
  for (const row of rows) {
    const items = await loadItems(db, row.id);
    const totals = dishTotals(items);
    summaries.push({
      id: row.id,
      name: row.name,
      photoUri: row.photo_uri,
      totalWeight: totals.totalWeight,
      totalCarbs: totals.totalCarbs,
      totalW: totals.totalW,
      hasEstimatedItems: totals.hasEstimatedItems,
    });
  }

  return summaries;
}
