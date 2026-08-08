export interface RecognizedItem {
  name: string;
  matchedProductName: string | null;
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

export function parseRecognizeRequestBody(body: unknown): RecognizeRequestBody {
  if (typeof body !== 'object' || body === null) {
    throw new RecognizeRequestError('Request body must be a JSON object', 400);
  }
  const { image, productNames } = body as Record<string, unknown>;
  if (typeof image !== 'string' || image.length === 0) {
    throw new RecognizeRequestError('"image" must be a non-empty base64 string', 400);
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
            },
            required: ['name', 'matchedProductName'],
            additionalProperties: false,
          },
        },
      },
      required: ['items'],
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
    max_tokens: 1024,
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
            text: `Identify every distinct ingredient visible in this dish photo. ${productListText}\n\nFor each ingredient, report its name and, if it matches one of the listed products in meaning (not necessarily exact wording), report that product's exact name as matchedProductName. Otherwise set matchedProductName to null.`,
          },
        ],
      },
    ],
  };
}

export function parseAnthropicToolResult(input: unknown): RecognizedItem[] {
  if (typeof input !== 'object' || input === null || !('items' in input)) {
    throw new RecognizeRequestError('Unexpected response shape from recognition model', 502);
  }
  const { items } = input as { items: unknown };
  if (!Array.isArray(items)) {
    throw new RecognizeRequestError('Unexpected response shape from recognition model', 502);
  }
  return items.map((item) => {
    if (typeof item !== 'object' || item === null || typeof (item as Record<string, unknown>).name !== 'string') {
      throw new RecognizeRequestError('Unexpected item shape from recognition model', 502);
    }
    const { name, matchedProductName } = item as Record<string, unknown>;
    return {
      name: name as string,
      matchedProductName: typeof matchedProductName === 'string' ? matchedProductName : null,
    };
  });
}
