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

  it('persists and round-trips a photoUri', async () => {
    const rice = await createProduct(db, { name: 'Rice', carbsPer100g: 28 });
    const dish = await createDish(db, {
      name: 'Rice bowl',
      items: [{ productId: rice.id, grams: 100, isEstimated: false }],
      photoUri: 'file:///document/dish-photos/abc.jpg',
    });

    expect(dish.photoUri).toBe('file:///document/dish-photos/abc.jpg');

    const reloaded = await getDish(db, dish.id);
    expect(reloaded?.photoUri).toBe('file:///document/dish-photos/abc.jpg');
  });

  it('defaults photoUri to null when not provided', async () => {
    const rice = await createProduct(db, { name: 'Rice', carbsPer100g: 28 });
    const dish = await createDish(db, {
      name: 'Rice bowl',
      items: [{ productId: rice.id, grams: 100, isEstimated: false }],
    });

    expect(dish.photoUri).toBeNull();
  });

  it('updates photoUri on an existing dish', async () => {
    const rice = await createProduct(db, { name: 'Rice', carbsPer100g: 28 });
    const dish = await createDish(db, {
      name: 'Rice bowl',
      items: [{ productId: rice.id, grams: 100, isEstimated: false }],
      photoUri: 'file:///document/dish-photos/old.jpg',
    });

    await updateDish(db, dish.id, {
      name: 'Rice bowl',
      items: [{ productId: rice.id, grams: 100, isEstimated: false }],
      photoUri: 'file:///document/dish-photos/new.jpg',
    });

    const updated = await getDish(db, dish.id);
    expect(updated?.photoUri).toBe('file:///document/dish-photos/new.jpg');
  });

  it('includes photoUri in dish summaries from listDishes', async () => {
    const rice = await createProduct(db, { name: 'Rice', carbsPer100g: 28 });
    await createDish(db, {
      name: 'Rice bowl',
      items: [{ productId: rice.id, grams: 100, isEstimated: false }],
      photoUri: 'file:///document/dish-photos/abc.jpg',
    });

    const results = await listDishes(db, 'Rice bowl');
    expect(results[0].photoUri).toBe('file:///document/dish-photos/abc.jpg');
  });
});
