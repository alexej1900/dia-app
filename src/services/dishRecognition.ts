export interface RecognizedItem {
  name: string;
  matchedProductName: string | null;
}

export class DishRecognitionError extends Error {}

export async function recognizeDish(imageBase64: string, productNames: string[]): Promise<RecognizedItem[]> {
  const apiUrl = process.env.EXPO_PUBLIC_RECOGNITION_API_URL;
  const apiSecret = process.env.EXPO_PUBLIC_RECOGNITION_API_SECRET;
  if (!apiUrl || !apiSecret) {
    throw new DishRecognitionError('Recognition service is not configured.');
  }

  let response: Response;
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Secret': apiSecret },
      body: JSON.stringify({ image: imageBase64, productNames }),
    });
  } catch {
    throw new DishRecognitionError('Could not reach recognition service. Check your connection.');
  }

  if (!response.ok) {
    throw new DishRecognitionError('Recognition failed. Try again or add ingredients manually.');
  }

  const data = (await response.json()) as { items?: RecognizedItem[] };
  return data.items ?? [];
}
