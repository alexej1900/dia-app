import { buildIngredientRow, applyGramsEdit, IngredientRow } from '../../src/screens/dishFormHelpers';
import type { Product } from '../../src/repositories/productsRepo';

const product: Product = {
  id: 'p1',
  name: 'Rice',
  carbsPer100g: 28,
  isSeed: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('buildIngredientRow', () => {
  it('prefills gramsText and flags the row when an estimate is given', () => {
    const row = buildIngredientRow(product, 150);
    expect(row).toEqual({
      productId: 'p1',
      productName: 'Rice',
      carbsPer100g: 28,
      gramsText: '150',
      isEstimated: true,
    });
  });

  it('leaves gramsText blank and unflagged when the estimate is null', () => {
    const row = buildIngredientRow(product, null);
    expect(row.gramsText).toBe('');
    expect(row.isEstimated).toBe(false);
  });

  it('defaults to no estimate when none is passed', () => {
    const row = buildIngredientRow(product);
    expect(row.gramsText).toBe('');
    expect(row.isEstimated).toBe(false);
  });
});

describe('applyGramsEdit', () => {
  it('updates gramsText and clears the estimated flag', () => {
    const estimated: IngredientRow = {
      productId: 'p1',
      productName: 'Rice',
      carbsPer100g: 28,
      gramsText: '150',
      isEstimated: true,
    };
    const edited = applyGramsEdit(estimated, '200');
    expect(edited).toEqual({ ...estimated, gramsText: '200', isEstimated: false });
  });

  it('keeps a non-estimated row unflagged after editing', () => {
    const manual: IngredientRow = {
      productId: 'p1',
      productName: 'Rice',
      carbsPer100g: 28,
      gramsText: '',
      isEstimated: false,
    };
    const edited = applyGramsEdit(manual, '75');
    expect(edited).toEqual({ ...manual, gramsText: '75', isEstimated: false });
  });
});
