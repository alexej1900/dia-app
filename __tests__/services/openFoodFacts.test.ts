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

  it('throws OpenFoodFactsError when the response is not ok after exhausting retries', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(searchCarbsByName('bread')).rejects.toThrow(OpenFoodFactsError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('retries a transient 5xx response and succeeds once the service recovers', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          products: [{ product_name: 'Butter', brands: null, nutriments: { carbohydrates_100g: 0.1 } }],
        }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const results = await searchCarbsByName('butter');

    expect(results).toEqual([{ name: 'Butter', brand: null, carbsPer100g: 0.1 }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 4xx client error', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(searchCarbsByName('bread')).rejects.toThrow(OpenFoodFactsError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
