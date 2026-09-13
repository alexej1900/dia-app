export class EstimateCarbsError extends Error {}

export async function estimateCarbsByName(name: string): Promise<number | null> {
  const recognitionApiUrl = process.env.EXPO_PUBLIC_RECOGNITION_API_URL;
  const apiSecret = process.env.EXPO_PUBLIC_RECOGNITION_API_SECRET;
  if (!recognitionApiUrl || !apiSecret) {
    throw new EstimateCarbsError('Estimation service is not configured.');
  }
  const apiUrl = recognitionApiUrl.replace(/\/recognize$/, '/estimate-carbs');

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
      throw new EstimateCarbsError('Estimate timed out. Try again or enter manually.');
    }
    throw new EstimateCarbsError('Could not reach estimation service. Check your connection.');
  }

  if (!response.ok) {
    throw new EstimateCarbsError('Estimate failed. Try again or enter manually.');
  }

  const data = (await response.json()) as { carbsPer100g?: unknown };
  return typeof data.carbsPer100g === 'number' ? data.carbsPer100g : null;
}
