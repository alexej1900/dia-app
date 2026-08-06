import { SqlExecutor } from './sqlExecutor';
import { createProduct } from '../repositories/productsRepo';
import { SEED_PRODUCTS } from './seedData';

export async function seedIfEmpty(db: SqlExecutor): Promise<void> {
  const existing = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM products');
  if (existing && existing.count > 0) return;

  for (const product of SEED_PRODUCTS) {
    await createProduct(db, product, true);
  }
}
