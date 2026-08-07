import { carbsToW, gramsPerW, dishTotals } from '../../src/calculations/carbs';

describe('carbsToW', () => {
  it('converts grams of carbs to W units using 10g per W', () => {
    expect(carbsToW(50)).toBe(5);
    expect(carbsToW(0)).toBe(0);
    expect(carbsToW(25)).toBe(2.5);
  });
});

describe('gramsPerW', () => {
  it('returns grams of product containing 1 W of carbs', () => {
    expect(gramsPerW(50)).toBe(20);
    expect(gramsPerW(10)).toBe(100);
  });

  it('returns null when carbsPer100g is zero or negative', () => {
    expect(gramsPerW(0)).toBeNull();
    expect(gramsPerW(-5)).toBeNull();
  });
});

describe('dishTotals', () => {
  it('sums weight and carbs across items and converts to W', () => {
    const totals = dishTotals([
      { carbsPer100g: 50, grams: 100 },
      { carbsPer100g: 20, grams: 50 },
    ]);
    expect(totals.totalWeight).toBe(150);
    expect(totals.totalCarbs).toBe(60);
    expect(totals.totalW).toBe(6);
  });

  it('returns zeros for an empty item list', () => {
    expect(dishTotals([])).toEqual({ totalWeight: 0, totalCarbs: 0, totalW: 0 });
  });
});
