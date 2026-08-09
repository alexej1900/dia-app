import { SqlExecutor } from '../db/sqlExecutor';
import { generateId } from '../utils/id';

export interface Product {
  id: string;
  name: string;
  carbsPer100g: number;
  isSeed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductInput {
  name: string;
  carbsPer100g: number;
}

interface ProductRow {
  id: string;
  name: string;
  carbs_per_100g: number;
  is_seed: number;
  created_at: string;
  updated_at: string;
}

function rowToProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    carbsPer100g: row.carbs_per_100g,
    isSeed: row.is_seed === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ProductInUseError extends Error {
  constructor(public dishNames: string[]) {
    super(`Cannot delete product: used in ${dishNames.join(', ')}`);
    this.name = 'ProductInUseError';
  }
}

export async function createProduct(db: SqlExecutor, input: ProductInput, isSeed = false): Promise<Product> {
  const now = new Date().toISOString();
  const id = generateId();
  await db.runAsync(
    'INSERT INTO products (id, name, carbs_per_100g, is_seed, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, input.name, input.carbsPer100g, isSeed ? 1 : 0, now, now]
  );
  return { id, name: input.name, carbsPer100g: input.carbsPer100g, isSeed, createdAt: now, updatedAt: now };
}

export async function updateProduct(db: SqlExecutor, id: string, input: ProductInput): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync('UPDATE products SET name = ?, carbs_per_100g = ?, updated_at = ? WHERE id = ?', [
    input.name,
    input.carbsPer100g,
    now,
    id,
  ]);
}

export async function getProduct(db: SqlExecutor, id: string): Promise<Product | null> {
  const row = await db.getFirstAsync<ProductRow>('SELECT * FROM products WHERE id = ?', [id]);
  return row ? rowToProduct(row) : null;
}

export async function listProducts(db: SqlExecutor, searchTerm = ''): Promise<Product[]> {
  const rows = await db.getAllAsync<ProductRow>(
    'SELECT * FROM products WHERE name LIKE ? ORDER BY name COLLATE NOCASE',
    [`%${searchTerm}%`]
  );
  return rows.map(rowToProduct);
}

export async function getProductByName(db: SqlExecutor, name: string): Promise<Product | null> {
  const row = await db.getFirstAsync<ProductRow>('SELECT * FROM products WHERE name = ? COLLATE NOCASE', [name]);
  return row ? rowToProduct(row) : null;
}

export async function getDishesUsingProduct(
  db: SqlExecutor,
  productId: string
): Promise<{ id: string; name: string }[]> {
  return db.getAllAsync<{ id: string; name: string }>(
    `SELECT DISTINCT dishes.id AS id, dishes.name AS name
     FROM dishes
     JOIN dish_items ON dish_items.dish_id = dishes.id
     WHERE dish_items.product_id = ?`,
    [productId]
  );
}

export async function deleteProduct(db: SqlExecutor, id: string): Promise<void> {
  const usedIn = await getDishesUsingProduct(db, id);
  if (usedIn.length > 0) {
    throw new ProductInUseError(usedIn.map((d) => d.name));
  }
  await db.runAsync('DELETE FROM products WHERE id = ?', [id]);
}
