import { recognizeDish, DishRecognitionError } from '../../src/services/dishRecognition';

const ORIGINAL_ENV = process.env;

describe('recognizeDish', () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      EXPO_PUBLIC_RECOGNITION_API_URL: 'https://worker.example/recognize',
      EXPO_PUBLIC_RECOGNITION_API_SECRET: 'test-secret',
    };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    jest.restoreAllMocks();
  });

  it('sends the image and product names, returning parsed items', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: [{ name: 'Rice', matchedProductName: 'Rice' }] }),
    }) as unknown as typeof fetch;

    const result = await recognizeDish('base64data', ['Rice']);

    expect(result.items).toEqual([{ name: 'Rice', matchedProductName: 'Rice' }]);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://worker.example/recognize',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-App-Secret': 'test-secret' }),
        body: JSON.stringify({ image: 'base64data', productNames: ['Rice'] }),
      })
    );
  });

  it('throws DishRecognitionError when the network request fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    await expect(recognizeDish('base64data', [])).rejects.toThrow(DishRecognitionError);
  });

  it('throws a specific DishRecognitionError message when the request times out', async () => {
    const timeoutError = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    global.fetch = jest.fn().mockRejectedValue(timeoutError) as unknown as typeof fetch;

    await expect(recognizeDish('base64data', [])).rejects.toThrow('Recognition timed out');
  });

  it('passes an AbortSignal to fetch for the client-side timeout', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: [] }),
    }) as unknown as typeof fetch;

    await recognizeDish('base64data', []);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://worker.example/recognize',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('throws DishRecognitionError when the response is not ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 502 }) as unknown as typeof fetch;

    await expect(recognizeDish('base64data', [])).rejects.toThrow(DishRecognitionError);
  });

  it('throws DishRecognitionError when the API is not configured', async () => {
    process.env.EXPO_PUBLIC_RECOGNITION_API_URL = '';
    process.env.EXPO_PUBLIC_RECOGNITION_API_SECRET = '';

    await expect(recognizeDish('base64data', [])).rejects.toThrow(DishRecognitionError);
  });

  it('passes through estimatedGrams from the response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items: [{ name: 'Rice', matchedProductName: 'Rice', estimatedGrams: 150 }],
      }),
    }) as unknown as typeof fetch;

    const result = await recognizeDish('base64data', ['Rice']);

    expect(result.items).toEqual([{ name: 'Rice', matchedProductName: 'Rice', estimatedGrams: 150 }]);
  });

  it('passes through dishNameSuggestions from the response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items: [],
        dishNameSuggestions: ['Grilled Chicken with Jollof Rice', 'Chicken and Rice Plate'],
      }),
    }) as unknown as typeof fetch;

    const result = await recognizeDish('base64data', []);

    expect(result.dishNameSuggestions).toEqual(['Grilled Chicken with Jollof Rice', 'Chicken and Rice Plate']);
  });

  it('defaults dishNameSuggestions to an empty array when the response omits it', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: [] }),
    }) as unknown as typeof fetch;

    const result = await recognizeDish('base64data', []);

    expect(result.dishNameSuggestions).toEqual([]);
  });

  it('defaults items to an empty array when the response has a non-array value', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: 'not an array', dishNameSuggestions: [] }),
    }) as unknown as typeof fetch;

    const result = await recognizeDish('base64data', []);

    expect(result.items).toEqual([]);
  });

  it('defaults dishNameSuggestions to an empty array when the response has a non-array value', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: [], dishNameSuggestions: 'not an array' }),
    }) as unknown as typeof fetch;

    const result = await recognizeDish('base64data', []);

    expect(result.dishNameSuggestions).toEqual([]);
  });
});
