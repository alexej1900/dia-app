export interface NameTranslation {
  translatedName: string | null;
}

export interface TranslateNameRequestBody {
  name: string;
}

export class TranslateNameRequestError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'TranslateNameRequestError';
  }
}

const MAX_NAME_LENGTH = 200;

export function parseTranslateNameRequestBody(body: unknown): TranslateNameRequestBody {
  if (typeof body !== 'object' || body === null) {
    throw new TranslateNameRequestError('Request body must be a JSON object', 400);
  }
  const { name } = body as Record<string, unknown>;
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new TranslateNameRequestError('"name" must be a non-empty string', 400);
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new TranslateNameRequestError('"name" is too long', 400);
  }
  return { name: name.trim() };
}

const TRANSLATE_TOOL_NAME = 'report_name_translation';

function buildToolDefinition() {
  return {
    name: TRANSLATE_TOOL_NAME,
    description: 'Report a Russian translation for a food product name.',
    input_schema: {
      type: 'object' as const,
      properties: {
        translatedName: {
          type: ['string', 'null'],
          description:
            'The Russian translation of this food product name, using the common everyday Russian term (not a literal/awkward translation). Null if this is not a recognizable food name, or is too ambiguous to translate with any confidence.',
        },
      },
      required: ['translatedName'],
      additionalProperties: false,
    },
  };
}

export function buildAnthropicRequestParams(body: TranslateNameRequestBody) {
  return {
    model: 'claude-haiku-4-5',
    max_tokens: 256,
    tool_choice: { type: 'tool' as const, name: TRANSLATE_TOOL_NAME },
    tools: [buildToolDefinition()],
    messages: [
      {
        role: 'user' as const,
        content: `Translate the food product name "${body.name}" to Russian, using the common everyday term a Russian speaker would use for this food (not a literal or awkward translation). If this isn't a recognizable food name, or is too vague to translate with any real confidence, report null instead of guessing.`,
      },
    ],
  };
}

export function parseAnthropicToolResult(input: unknown): NameTranslation {
  if (typeof input !== 'object' || input === null) {
    throw new TranslateNameRequestError('Unexpected response shape from translation model', 502);
  }
  const { translatedName } = input as Record<string, unknown>;
  const trimmed = typeof translatedName === 'string' ? translatedName.trim() : '';
  return { translatedName: trimmed.length > 0 ? trimmed : null };
}
