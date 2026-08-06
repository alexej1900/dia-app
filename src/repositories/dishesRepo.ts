import { SqlExecutor } from '../db/sqlExecutor';
import { generateId } from '../utils/id';
import { dishTotals, carbsToW, DishTotals } from '../calculations/carbs';

export interface DishItemInput {
  productId: string;
  grams: number;
}

export interface DishInput {
  name: string;
  items: DishItemInput[];
}

export interface DishItem {
  productId: string;
  productName: string;
  carbsPer100g: number;
  grams: number;
}

export interface Dish {
  id: string;
  name: string;
  items: DishItem[];
  totals: DishTotals;
  createdAt: string;
  updatedAt: string;
}

export interface DishSummary {
  id: string;
  name: string;
  totalWeight: number;
  totalCarbs: number;
  totalW: number;
}

interface DishRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

interface DishItemRow {
  product_id: string;
  name: string;
  carbs_per_100g: number;
  grams: number;
}

async function loadItems(db: SqlExecutor, dishId: string): Promise<DishItem[]> {
  const rows = await db.getAllAsync<DishItemRow>(
    `SELECT dish_items.product_id AS product_id, products.name AS name,
            products.carbs_per_100g AS carbs_per_100g, dish_items.grams AS grams
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
  }));
}

async function replaceItemsRaw(db: SqlExecutor, dishId: string, items: DishItemInput[]): Promise<void> {
  await db.runAsync('DELETE FROM dish_items WHERE dish_id = ?', [dishId]);
  for (const item of items) {
    await db.runAsync('INSERT INTO dish_items (dish_id, product_id, grams) VALUES (?, ?, ?)', [
      dishId,
      item.productId,
      item.grams,
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
    await db.runAsync('INSERT INTO dishes (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)', [
      id,
      input.name,
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
    await db.runAsync('UPDATE dishes SET name = ?, updated_at = ? WHERE id = ?', [input.name, now, id]);
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
    items,
    totals: dishTotals(items),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listDishes(db: SqlExecutor, searchTerm = ''): Promise<DishSummary[]> {
  const rows = await db.getAllAsync<{ id: string; name: string }>(
    `SELECT dishes.id AS id, dishes.name AS name
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
      totalWeight: totals.totalWeight,
      totalCarbs: totals.totalCarbs,
      totalW: totals.totalW,
    });
  }

  return summaries;
}
