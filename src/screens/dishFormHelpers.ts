import type { Product } from '../repositories/productsRepo';

export interface IngredientRow {
  productId: string;
  productName: string;
  carbsPer100g: number;
  gramsText: string;
  isEstimated: boolean;
}

export function buildIngredientRow(product: Product, estimatedGrams: number | null = null): IngredientRow {
  const resolvedEstimate =
    typeof estimatedGrams === 'number' && Number.isFinite(estimatedGrams) && Math.round(estimatedGrams) > 0
      ? Math.round(estimatedGrams)
      : null;
  return {
    productId: product.id,
    productName: product.name,
    carbsPer100g: product.carbsPer100g,
    gramsText: resolvedEstimate !== null ? String(resolvedEstimate) : '',
    isEstimated: resolvedEstimate !== null,
  };
}

export function applyGramsEdit(item: IngredientRow, gramsText: string): IngredientRow {
  return { ...item, gramsText, isEstimated: false };
}
