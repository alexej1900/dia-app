export interface CarbEstimate {
  carbsPer100g: number | null;
}

export interface EstimateCarbsRequestBody {
  name: string;
}

export class EstimateCarbsRequestError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'EstimateCarbsRequestError';
  }
}

const MAX_NAME_LENGTH = 200;

export function parseEstimateCarbsRequestBody(body: unknown): EstimateCarbsRequestBody {
  if (typeof body !== 'object' || body === null) {
    throw new EstimateCarbsRequestError('Request body must be a JSON object', 400);
  }
  const { name } = body as Record<string, unknown>;
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new EstimateCarbsRequestError('"name" must be a non-empty string', 400);
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new EstimateCarbsRequestError('"name" is too long', 400);
  }
  return { name: name.trim() };
}

const ESTIMATE_TOOL_NAME = 'report_carb_estimate';

function buildToolDefinition() {
  return {
    name: ESTIMATE_TOOL_NAME,
    description: 'Report an estimated carbohydrate content for a named food item.',
    input_schema: {
      type: 'object' as const,
      properties: {
        carbsPer100g: {
          type: ['number', 'null'],
          description:
            'Your best estimate of grams of carbohydrate per 100g of this food, based on general nutritional knowledge. Null if this is not a recognizable food, or is too ambiguous/generic to estimate with any confidence.',
        },
      },
      required: ['carbsPer100g'],
      additionalProperties: false,
    },
  };
}

export function buildAnthropicRequestParams(body: EstimateCarbsRequestBody) {
  return {
    model: 'claude-haiku-4-5',
    max_tokens: 256,
    tool_choice: { type: 'tool' as const, name: ESTIMATE_TOOL_NAME },
    tools: [buildToolDefinition()],
    messages: [
      {
        role: 'user' as const,
        content: `Estimate the carbohydrate content per 100g of "${body.name}", using general nutritional knowledge of common foods. If this isn't a recognizable food, or is too vague to estimate with any real confidence, report null instead of guessing.`,
      },
    ],
  };
}

// Carbohydrate content can't exceed 100g per 100g of food (a food that is pure
// carbohydrate, like table sugar). A higher value is a hallucination.
const MAX_PLAUSIBLE_CARBS_PER_100G = 100;

export function parseAnthropicToolResult(input: unknown): CarbEstimate {
  if (typeof input !== 'object' || input === null) {
    throw new EstimateCarbsRequestError('Unexpected response shape from estimation model', 502);
  }
  const { carbsPer100g } = input as Record<string, unknown>;
  const resolved =
    typeof carbsPer100g === 'number' &&
    Number.isFinite(carbsPer100g) &&
    carbsPer100g >= 0 &&
    carbsPer100g <= MAX_PLAUSIBLE_CARBS_PER_100G
      ? carbsPer100g
      : null;
  return { carbsPer100g: resolved };
}
