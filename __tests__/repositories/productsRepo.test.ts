import { createTestDatabase } from '../../src/testUtils/createTestDatabase';
import {
  createProduct,
  updateProduct,
  getProduct,
  listProducts,
  deleteProduct,
  getProductByName,
  ProductInUseError,
} from '../../src/repositories/productsRepo';
import { SqlExecutor } from '../../src/db/sqlExecutor';

describe('productsRepo', () => {
  let db: SqlExecutor;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  it('creates and retrieves a product', async () => {
    const created = await createProduct(db, { name: 'Rice', carbsPer100g: 28 });
    const fetched = await getProduct(db, created.id);
    expect(fetched).toEqual(created);
  });

  it('updates a product', async () => {
    const created = await createProduct(db, { name: 'Rice', carbsPer100g: 28 });
    await updateProduct(db, created.id, { name: 'Brown Rice', carbsPer100g: 23 });
    const fetched = await getProduct(db, created.id);
    expect(fetched?.name).toBe('Brown Rice');
    expect(fetched?.carbsPer100g).toBe(23);
  });

  it('lists products filtered by search term, sorted by name', async () => {
    await createProduct(db, { name: 'Potato', carbsPer100g: 17 });
    await createProduct(db, { name: 'Pasta', carbsPer100g: 25 });
    await createProduct(db, { name: 'Bread', carbsPer100g: 45 });

    const results = await listProducts(db, 'pa');
    expect(results.map((p) => p.name)).toEqual(['Pasta']);
  });

  it('deletes a product that is not used in any dish', async () => {
    const created = await createProduct(db, { name: 'Rice', carbsPer100g: 28 });
    await deleteProduct(db, created.id);
    expect(await getProduct(db, created.id)).toBeNull();
  });

  it('refuses to delete a product used in a dish, listing the dish names', async () => {
    const product = await createProduct(db, { name: 'Rice', carbsPer100g: 28 });
    await db.runAsync('INSERT INTO dishes (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)', [
      'd1',
      'Rice Bowl',
      '2026-08-06T00:00:00.000Z',
      '2026-08-06T00:00:00.000Z',
    ]);
    await db.runAsync('INSERT INTO dish_items (dish_id, product_id, grams) VALUES (?, ?, ?)', [
      'd1',
      product.id,
      150,
    ]);

    await expect(deleteProduct(db, product.id)).rejects.toThrow(ProductInUseError);
    expect(await getProduct(db, product.id)).not.toBeNull();
  });

  it('finds a product by exact, case-insensitive name match', async () => {
    await createProduct(db, { name: 'Chicken Breast', carbsPer100g: 0 });
    const found = await getProductByName(db, 'chicken breast');
    expect(found?.name).toBe('Chicken Breast');
  });

  it('returns null when no product matches the name exactly', async () => {
    await createProduct(db, { name: 'Chicken Breast', carbsPer100g: 0 });
    expect(await getProductByName(db, 'Chicken')).toBeNull();
  });

  it('finds a product by name ignoring incidental leading/trailing whitespace', async () => {
    await createProduct(db, { name: 'Chicken Breast', carbsPer100g: 0 });
    const found = await getProductByName(db, '  Chicken Breast  ');
    expect(found?.name).toBe('Chicken Breast');
  });
});
