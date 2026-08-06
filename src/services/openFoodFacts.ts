export interface OpenFoodFactsMatch {
  name: string;
  brand: string | null;
  carbsPer100g: number;
}

export class OpenFoodFactsError extends Error {}

interface OpenFoodFactsProduct {
  product_name?: string;
  brands?: string;
  nutriments?: { carbohydrates_100g?: number };
}

interface OpenFoodFactsResponse {
  products?: OpenFoodFactsProduct[];
}

export async function searchCarbsByName(name: string): Promise<OpenFoodFactsMatch[]> {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(
    name
  )}&fields=product_name,brands,nutriments&json=1&page_size=20`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new OpenFoodFactsError('Could not reach Open Food Facts. Check your internet connection.');
  }

  if (!response.ok) {
    throw new OpenFoodFactsError(`Open Food Facts request failed with status ${response.status}`);
  }

  const data = (await response.json()) as OpenFoodFactsResponse;
  const products = data.products ?? [];

  return products
    .filter(
      (p): p is OpenFoodFactsProduct & { nutriments: { carbohydrates_100g: number } } =>
        typeof p.nutriments?.carbohydrates_100g === 'number' && !!p.product_name
    )
    .map((p) => ({
      name: p.product_name!,
      brand: p.brands ?? null,
      carbsPer100g: p.nutriments.carbohydrates_100g,
    }));
}
