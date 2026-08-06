import { createTestDatabase } from '../../src/testUtils/createTestDatabase';
import { seedIfEmpty } from '../../src/db/seed';
import { listProducts, createProduct } from '../../src/repositories/productsRepo';
import { SEED_PRODUCTS } from '../../src/db/seedData';

describe('seedIfEmpty', () => {
  it('inserts the seed products into an empty database', async () => {
    const db = await createTestDatabase();
    await seedIfEmpty(db);
    const products = await listProducts(db);
    expect(products).toHaveLength(SEED_PRODUCTS.length);
    expect(products.every((p) => p.isSeed)).toBe(true);
  });

  it('does nothing if the database already has products', async () => {
    const db = await createTestDatabase();
    await createProduct(db, { name: 'Custom product', carbsPer100g: 5 });
    await seedIfEmpty(db);
    const products = await listProducts(db);
    expect(products).toHaveLength(1);
    expect(products[0].name).toBe('Custom product');
  });
});
