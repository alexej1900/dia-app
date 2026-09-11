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

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 300;

// Open Food Facts' legacy search endpoint is intermittently flaky under load,
// returning a 503 that clears up on an immediate retry (observed live: the same
// query failed twice, then succeeded, within a couple of seconds). Retry
// transient failures (network errors and 5xx) a couple of times; a 4xx means
// the request itself is wrong, so retrying it would never help.
async function fetchWithRetry(url: string): Promise<Response> {
  let lastNetworkError: unknown;
  let lastResponse: Response | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) {
        return response;
      }
      lastResponse = response;
    } catch (e) {
      lastNetworkError = e;
    }
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
  if (lastResponse) return lastResponse;
  throw lastNetworkError;
}

export async function searchCarbsByName(name: string): Promise<OpenFoodFactsMatch[]> {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(
    name
  )}&fields=product_name,brands,nutriments&json=1&page_size=20`;

  let response: Response;
  try {
    response = await fetchWithRetry(url);
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
