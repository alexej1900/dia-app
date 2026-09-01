import type { Product } from '../repositories/productsRepo';

export interface IngredientRow {
  productId: string;
  productName: string;
  carbsPer100g: number;
  gramsText: string;
  isEstimated: boolean;
}

export function buildIngredientRow(product: Product, estimatedGrams: number | null = null): IngredientRow {
  return {
    productId: product.id,
    productName: product.name,
    carbsPer100g: product.carbsPer100g,
    gramsText: estimatedGrams !== null ? String(estimatedGrams) : '',
    isEstimated: estimatedGrams !== null,
  };
}

export function applyGramsEdit(item: IngredientRow, gramsText: string): IngredientRow {
  return { ...item, gramsText, isEstimated: false };
}
