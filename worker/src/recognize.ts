export interface RecognizedItem {
  name: string;
  matchedProductName: string | null;
  estimatedGrams: number | null;
}

export interface RecognitionResult {
  items: RecognizedItem[];
  dishNameSuggestions: string[];
}

export interface RecognizeRequestBody {
  image: string;
  productNames: string[];
}

export class RecognizeRequestError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'RecognizeRequestError';
  }
}

export function checkAuth(providedSecret: string | null, expectedSecret: string): boolean {
  return providedSecret !== null && providedSecret === expectedSecret;
}

// Roughly 10MB of decoded-equivalent size (base64 expands ~4/3), used as a
// sanity ceiling so a client that skips the resize step gets a clear 400
// instead of a generic 502 from the Anthropic call.
const MAX_IMAGE_BASE64_LENGTH = 14_000_000;

// A hallucinated portion weight (e.g. thousands of grams for a plate of rice) should
// fail soft to null rather than flow through as a plausible estimate. 5kg is generous
// for any single dish/ingredient portion.
const MAX_PLAUSIBLE_ESTIMATED_GRAMS = 5000;

export function parseRecognizeRequestBody(body: unknown): RecognizeRequestBody {
  if (typeof body !== 'object' || body === null) {
    throw new RecognizeRequestError('Request body must be a JSON object', 400);
  }
  const { image, productNames } = body as Record<string, unknown>;
  if (typeof image !== 'string' || image.length === 0) {
    throw new RecognizeRequestError('"image" must be a non-empty base64 string', 400);
  }
  if (image.length > MAX_IMAGE_BASE64_LENGTH) {
    throw new RecognizeRequestError('"image" is too large. Please use a smaller photo.', 400);
  }
  if (!Array.isArray(productNames) || !productNames.every((p) => typeof p === 'string')) {
    throw new RecognizeRequestError('"productNames" must be an array of strings', 400);
  }
  return { image, productNames };
}

const RECOGNIZE_TOOL_NAME = 'report_recognized_ingredients';

function buildToolDefinition() {
  return {
    name: RECOGNIZE_TOOL_NAME,
    description:
      'Report every distinct ingredient visible in the dish photo, matched against the provided list of existing product names where possible.',
    input_schema: {
      type: 'object' as const,
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'The ingredient name as you identify it from the photo.',
              },
              matchedProductName: {
                type: ['string', 'null'],
                description:
                  "The exact matching name from the supplied product list, if this ingredient corresponds to one of them in meaning. Null if it does not match any of them.",
              },
              estimatedGrams: {
                type: ['integer', 'null'],
                description:
                  "Your best-guess weight of this ingredient's visible portion in grams, based on typical portion sizes, plate/bowl scale, and food density. Null if you cannot judge it from the photo.",
              },
            },
            required: ['name', 'matchedProductName', 'estimatedGrams'],
            additionalProperties: false,
          },
        },
        dishNameSuggestions: {
          type: 'array',
          items: { type: 'string' },
          description:
            '2-3 short, natural suggested names for the dish as a whole (not per-ingredient) that a home cook might use, e.g. "Grilled Chicken with Jollof Rice" or "Chicken and Rice Plate". Empty array if the dish is too generic or ambiguous to name with confidence.',
        },
      },
      required: ['items', 'dishNameSuggestions'],
      additionalProperties: false,
    },
  };
}

export function buildAnthropicRequestParams(body: RecognizeRequestBody) {
  const productListText =
    body.productNames.length > 0
      ? `The user's existing product list:\n${body.productNames.map((n) => `- ${n}`).join('\n')}`
      : "The user's product list is currently empty.";

  return {
    model: 'claude-haiku-4-5',
    max_tokens: 3072,
    tool_choice: { type: 'tool' as const, name: RECOGNIZE_TOOL_NAME },
    tools: [buildToolDefinition()],
    messages: [
      {
        role: 'user' as const,
        content: [
          {
            type: 'image' as const,
            source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: body.image },
          },
          {
            type: 'text' as const,
            text: `Identify every distinct ingredient visible in this dish photo. ${productListText}\n\nFor each ingredient, report its name and, if it matches one of the listed products in meaning (not necessarily exact wording), report that product's exact name as matchedProductName. Otherwise set matchedProductName to null.\n\nAlso estimate that ingredient's visible portion weight in grams, using ordinary visual cues such as plate or bowl size, how full a container looks, and typical serving sizes for that kind of food. No physical reference object is provided in the photo, so use your best judgment. If you genuinely cannot judge it, set estimatedGrams to null.\n\nFinally, suggest 2-3 short, natural names for the dish as a whole (not per-ingredient) that a home cook might use, such as "Grilled Chicken with Jollof Rice" or "Chicken and Rice Plate". If the dish is too generic or ambiguous to name with confidence, return an empty array for dishNameSuggestions.`,
          },
        ],
      },
    ],
  };
}

export function parseAnthropicToolResult(input: unknown, productNames: string[]): RecognitionResult {
  if (typeof input !== 'object' || input === null || !('items' in input)) {
    throw new RecognizeRequestError('Unexpected response shape from recognition model', 502);
  }
  const { items, dishNameSuggestions } = input as { items: unknown; dishNameSuggestions?: unknown };
  if (!Array.isArray(items)) {
    throw new RecognizeRequestError('Unexpected response shape from recognition model', 502);
  }
  const parsedItems = items.map((item) => {
    if (typeof item !== 'object' || item === null || typeof (item as Record<string, unknown>).name !== 'string') {
      throw new RecognizeRequestError('Unexpected item shape from recognition model', 502);
    }
    const { name, matchedProductName, estimatedGrams } = item as Record<string, unknown>;
    const resolvedMatch =
      typeof matchedProductName === 'string'
        ? (productNames.find((p) => p.toLowerCase() === matchedProductName.toLowerCase()) ?? null)
        : null;
    const roundedEstimatedGrams =
      typeof estimatedGrams === 'number' && Number.isFinite(estimatedGrams) ? Math.round(estimatedGrams) : null;
    const resolvedEstimatedGrams =
      roundedEstimatedGrams !== null && roundedEstimatedGrams > 0 && roundedEstimatedGrams <= MAX_PLAUSIBLE_ESTIMATED_GRAMS
        ? roundedEstimatedGrams
        : null;
    return {
      name: name as string,
      matchedProductName: resolvedMatch,
      estimatedGrams: resolvedEstimatedGrams,
    };
  });

  const resolvedDishNameSuggestions = Array.isArray(dishNameSuggestions)
    ? dishNameSuggestions.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).slice(0, 3)
    : [];

  return { items: parsedItems, dishNameSuggestions: resolvedDishNameSuggestions };
}
