import { createTestDatabase } from '../../src/testUtils/createTestDatabase';

describe('database schema', () => {
  it('creates products, dishes, and dish_items tables', async () => {
    const db = await createTestDatabase();
    const tables = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    expect(tables.map((t) => t.name)).toEqual(['dish_items', 'dishes', 'products']);
  });

  it('enforces ON DELETE RESTRICT from dish_items to products', async () => {
    const db = await createTestDatabase();
    await db.runAsync(
      'INSERT INTO products (id, name, carbs_per_100g, is_seed, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)',
      ['p1', 'Bread', 45, '2026-08-06T00:00:00.000Z', '2026-08-06T00:00:00.000Z']
    );
    await db.runAsync('INSERT INTO dishes (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)', [
      'd1',
      'Toast',
      '2026-08-06T00:00:00.000Z',
      '2026-08-06T00:00:00.000Z',
    ]);
    await db.runAsync('INSERT INTO dish_items (dish_id, product_id, grams) VALUES (?, ?, ?)', ['d1', 'p1', 50]);

    await expect(db.runAsync('DELETE FROM products WHERE id = ?', ['p1'])).rejects.toThrow();
  });
});
