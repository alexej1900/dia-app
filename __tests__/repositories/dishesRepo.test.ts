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
        { productId: bread.id, grams: 100 },
        { productId: cheese.id, grams: 50 },
      ],
    });

    expect(dish.items).toHaveLength(2);
    expect(dish.totals.totalWeight).toBe(150);
    expect(dish.totals.totalCarbs).toBe(51);
    expect(dish.totals.totalW).toBe(5.1);
  });

  it('rejects creating a dish with no ingredients', async () => {
    await expect(createDish(db, { name: 'Empty', items: [] })).rejects.toThrow(
      'A dish must have at least one ingredient'
    );
  });

  it('updates a dish, replacing its ingredient list', async () => {
    const rice = await createProduct(db, { name: 'Rice', carbsPer100g: 28 });
    const dish = await createDish(db, { name: 'Rice bowl', items: [{ productId: rice.id, grams: 200 }] });

    const beans = await createProduct(db, { name: 'Beans', carbsPer100g: 20 });
    await updateDish(db, dish.id, {
      name: 'Rice and beans',
      items: [
        { productId: rice.id, grams: 150 },
        { productId: beans.id, grams: 100 },
      ],
    });

    const updated = await getDish(db, dish.id);
    expect(updated?.name).toBe('Rice and beans');
    expect(updated?.items).toHaveLength(2);
    expect(updated?.totals.totalCarbs).toBe(62);
  });

  it('deletes a dish and its ingredient rows', async () => {
    const rice = await createProduct(db, { name: 'Rice', carbsPer100g: 28 });
    const dish = await createDish(db, { name: 'Rice bowl', items: [{ productId: rice.id, grams: 200 }] });

    await deleteDish(db, dish.id);

    expect(await getDish(db, dish.id)).toBeNull();
    const remainingItems = await db.getAllAsync('SELECT * FROM dish_items WHERE dish_id = ?', [dish.id]);
    expect(remainingItems).toHaveLength(0);
  });

  it('lists dishes filtered by search term, with totals', async () => {
    const rice = await createProduct(db, { name: 'Rice', carbsPer100g: 28 });
    await createDish(db, { name: 'Rice bowl', items: [{ productId: rice.id, grams: 100 }] });
    await createDish(db, { name: 'Salad', items: [{ productId: rice.id, grams: 50 }] });

    const results = await listDishes(db, 'rice');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Rice bowl');
    expect(results[0].totalWeight).toBe(100);
    expect(results[0].totalCarbs).toBe(28);
    expect(results[0].totalW).toBe(2.8);
  });

  it('rolls back on duplicate productId in items', async () => {
    const rice = await createProduct(db, { name: 'Rice', carbsPer100g: 28 });
    const dishesBefore = await db.getAllAsync('SELECT * FROM dishes');
    expect(dishesBefore).toHaveLength(0);

    await expect(
      createDish(db, {
        name: 'Broken dish',
        items: [
          { productId: rice.id, grams: 100 },
          { productId: rice.id, grams: 50 },
        ],
      })
    ).rejects.toThrow();

    const dishesAfter = await db.getAllAsync('SELECT * FROM dishes');
    expect(dishesAfter).toHaveLength(0);
  });
});
