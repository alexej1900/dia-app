export const GRAMS_PER_W = 10;

export function carbsToW(carbsGrams: number): number {
  return carbsGrams / GRAMS_PER_W;
}

export function gramsPerW(carbsPer100g: number): number | null {
  if (carbsPer100g <= 0) return null;
  return (GRAMS_PER_W * 100) / carbsPer100g;
}

export interface DishItemForCalc {
  carbsPer100g: number;
  grams: number;
  isEstimated: boolean;
}

export interface DishTotals {
  totalWeight: number;
  totalCarbs: number;
  totalW: number;
  hasEstimatedItems: boolean;
}

export function dishTotals(items: DishItemForCalc[]): DishTotals {
  const totalWeight = items.reduce((sum, i) => sum + i.grams, 0);
  const totalCarbs = items.reduce((sum, i) => sum + (i.carbsPer100g * i.grams) / 100, 0);
  const hasEstimatedItems = items.some((i) => i.isEstimated);
  return { totalWeight, totalCarbs, totalW: carbsToW(totalCarbs), hasEstimatedItems };
}
