import { estimateCarbsByName, EstimateCarbsError } from '../../src/services/estimateCarbsByName';

const ORIGINAL_ENV = process.env;

describe('estimateCarbsByName', () => {
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

  it('derives the estimate-carbs URL from the recognition URL and sends the name', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ carbsPer100g: 42.5 }),
    }) as unknown as typeof fetch;

    const result = await estimateCarbsByName('Sesame seed bun');

    expect(result).toBe(42.5);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://worker.example/estimate-carbs',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-App-Secret': 'test-secret' }),
        body: JSON.stringify({ name: 'Sesame seed bun' }),
      })
    );
  });

  it('passes an AbortSignal to fetch for the client-side timeout', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ carbsPer100g: 10 }),
    }) as unknown as typeof fetch;

    await estimateCarbsByName('Rice');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://worker.example/estimate-carbs',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('returns null when the model could not estimate confidently', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ carbsPer100g: null }),
    }) as unknown as typeof fetch;

    const result = await estimateCarbsByName('xyzzy');

    expect(result).toBeNull();
  });

  it('defaults to null when the response omits carbsPer100g', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    }) as unknown as typeof fetch;

    const result = await estimateCarbsByName('Rice');

    expect(result).toBeNull();
  });

  it('throws EstimateCarbsError when the network request fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    await expect(estimateCarbsByName('Rice')).rejects.toThrow(EstimateCarbsError);
  });

  it('throws a specific EstimateCarbsError message when the request times out', async () => {
    const timeoutError = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    global.fetch = jest.fn().mockRejectedValue(timeoutError) as unknown as typeof fetch;

    await expect(estimateCarbsByName('Rice')).rejects.toThrow('timed out');
  });

  it('throws EstimateCarbsError when the response is not ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 502 }) as unknown as typeof fetch;

    await expect(estimateCarbsByName('Rice')).rejects.toThrow(EstimateCarbsError);
  });

  it('throws EstimateCarbsError when the API is not configured', async () => {
    process.env.EXPO_PUBLIC_RECOGNITION_API_URL = '';
    process.env.EXPO_PUBLIC_RECOGNITION_API_SECRET = '';

    await expect(estimateCarbsByName('Rice')).rejects.toThrow(EstimateCarbsError);
  });
});
