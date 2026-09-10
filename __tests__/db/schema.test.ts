import { createTestDatabase } from '../../src/testUtils/createTestDatabase';
import { migrateSchema } from '../../src/db/schema';

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

  it('rolls back on transaction error', async () => {
    const db = await createTestDatabase();
    const before = await db.getAllAsync<{ id: string }>(
      'SELECT id FROM products'
    );
    expect(before).toHaveLength(0);

    await expect(
      db.withTransactionAsync(async () => {
        await db.runAsync(
          'INSERT INTO products (id, name, carbs_per_100g, is_seed, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)',
          ['p1', 'Bread', 45, '2026-08-06T00:00:00.000Z', '2026-08-06T00:00:00.000Z']
        );
        throw new Error('Simulated error');
      })
    ).rejects.toThrow('Simulated error');

    const after = await db.getAllAsync<{ id: string }>(
      'SELECT id FROM products'
    );
    expect(after).toHaveLength(0);
  });

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
});
