import { splitReviewRows, ReviewRow } from '../../src/screens/photoReviewHelpers';
import type { Product } from '../../src/repositories/productsRepo';

const product: Product = {
  id: 'p1',
  name: 'Rice',
  carbsPer100g: 28,
  isSeed: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('splitReviewRows', () => {
  it('carries a checked, matched row into matchedProducts along with its estimate', () => {
    const rows: ReviewRow[] = [{ name: 'Rice', product, estimatedGrams: 150, checked: true }];
    const { matchedProducts, unmatchedNames } = splitReviewRows(rows);
    expect(matchedProducts).toEqual([{ product, estimatedGrams: 150 }]);
    expect(unmatchedNames).toEqual([]);
  });

  it('carries a checked, unmatched row into unmatchedNames along with its estimate', () => {
    const rows: ReviewRow[] = [{ name: 'Sauteed spinach', product: null, estimatedGrams: 80, checked: true }];
    const { matchedProducts, unmatchedNames } = splitReviewRows(rows);
    expect(matchedProducts).toEqual([]);
    expect(unmatchedNames).toEqual([{ name: 'Sauteed spinach', estimatedGrams: 80 }]);
  });

  it('drops an unchecked row from both arrays, whether matched or not', () => {
    const rows: ReviewRow[] = [
      { name: 'Rice', product, estimatedGrams: 150, checked: false },
      { name: 'Sauteed spinach', product: null, estimatedGrams: 80, checked: false },
    ];
    const { matchedProducts, unmatchedNames } = splitReviewRows(rows);
    expect(matchedProducts).toEqual([]);
    expect(unmatchedNames).toEqual([]);
  });
});
