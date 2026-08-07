import { searchCarbsByName, OpenFoodFactsError } from '../../src/services/openFoodFacts';

describe('searchCarbsByName', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns matches that have carb data, skipping ones that do not', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        products: [
          { product_name: 'White Bread', brands: 'Acme', nutriments: { carbohydrates_100g: 49 } },
          { product_name: 'Mystery Item', nutriments: {} },
        ],
      }),
    }) as unknown as typeof fetch;

    const results = await searchCarbsByName('bread');

    expect(results).toEqual([{ name: 'White Bread', brand: 'Acme', carbsPer100g: 49 }]);
  });

  it('throws OpenFoodFactsError when the network request fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    await expect(searchCarbsByName('bread')).rejects.toThrow(OpenFoodFactsError);
  });

  it('throws OpenFoodFactsError when the response is not ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;

    await expect(searchCarbsByName('bread')).rejects.toThrow(OpenFoodFactsError);
  });
});
