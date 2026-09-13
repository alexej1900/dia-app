export class TranslateProductNameError extends Error {}

export async function translateProductName(name: string): Promise<string | null> {
  const recognitionApiUrl = process.env.EXPO_PUBLIC_RECOGNITION_API_URL;
  const apiSecret = process.env.EXPO_PUBLIC_RECOGNITION_API_SECRET;
  if (!recognitionApiUrl || !apiSecret) {
    throw new TranslateProductNameError('Translation service is not configured.');
  }
  const apiUrl = recognitionApiUrl.replace(/\/recognize$/, '/translate-name');

  let response: Response;
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Secret': apiSecret },
      body: JSON.stringify({ name }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    if (typeof e === 'object' && e !== null && 'name' in e && e.name === 'TimeoutError') {
      throw new TranslateProductNameError('Translation timed out.');
    }
    throw new TranslateProductNameError('Could not reach translation service. Check your connection.');
  }

  if (!response.ok) {
    throw new TranslateProductNameError('Translation failed.');
  }

  const data = (await response.json()) as { translatedName?: unknown };
  return typeof data.translatedName === 'string' ? data.translatedName : null;
}
