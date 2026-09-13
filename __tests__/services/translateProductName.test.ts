import { translateProductName, TranslateProductNameError } from '../../src/services/translateProductName';

const ORIGINAL_ENV = process.env;

describe('translateProductName', () => {
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

  it('derives the translate-name URL from the recognition URL and sends the name', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ translatedName: 'Яблоко' }),
    }) as unknown as typeof fetch;

    const result = await translateProductName('Apple');

    expect(result).toBe('Яблоко');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://worker.example/translate-name',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-App-Secret': 'test-secret' }),
        body: JSON.stringify({ name: 'Apple' }),
      })
    );
  });

  it('passes an AbortSignal to fetch for the client-side timeout', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ translatedName: 'Рис' }),
    }) as unknown as typeof fetch;

    await translateProductName('Rice');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://worker.example/translate-name',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('returns null when the model could not translate confidently', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ translatedName: null }),
    }) as unknown as typeof fetch;

    const result = await translateProductName('xyzzy');

    expect(result).toBeNull();
  });

  it('defaults to null when the response omits translatedName', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    }) as unknown as typeof fetch;

    const result = await translateProductName('Rice');

    expect(result).toBeNull();
  });

  it('throws TranslateProductNameError when the network request fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    await expect(translateProductName('Rice')).rejects.toThrow(TranslateProductNameError);
  });

  it('throws a specific TranslateProductNameError message when the request times out', async () => {
    const timeoutError = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    global.fetch = jest.fn().mockRejectedValue(timeoutError) as unknown as typeof fetch;

    await expect(translateProductName('Rice')).rejects.toThrow('timed out');
  });

  it('throws TranslateProductNameError when the response is not ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 502 }) as unknown as typeof fetch;

    await expect(translateProductName('Rice')).rejects.toThrow(TranslateProductNameError);
  });

  it('throws TranslateProductNameError when the API is not configured', async () => {
    process.env.EXPO_PUBLIC_RECOGNITION_API_URL = '';
    process.env.EXPO_PUBLIC_RECOGNITION_API_SECRET = '';

    await expect(translateProductName('Rice')).rejects.toThrow(TranslateProductNameError);
  });
});
