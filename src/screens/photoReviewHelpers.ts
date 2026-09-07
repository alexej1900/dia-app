import type { Product } from '../repositories/productsRepo';

export interface ReviewRow {
  name: string;
  product: Product | null;
  estimatedGrams: number | null;
  checked: boolean;
}

export function splitReviewRows(rows: ReviewRow[]): {
  matchedProducts: { product: Product; estimatedGrams: number | null }[];
  unmatchedNames: { name: string; estimatedGrams: number | null }[];
} {
  const matchedProducts = rows
    .filter((r) => r.checked && r.product)
    .map((r) => ({ product: r.product as Product, estimatedGrams: r.estimatedGrams }));
  const unmatchedNames = rows
    .filter((r) => r.checked && !r.product)
    .map((r) => ({ name: r.name, estimatedGrams: r.estimatedGrams }));
  return { matchedProducts, unmatchedNames };
}
