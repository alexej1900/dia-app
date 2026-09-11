import { describe, expect, it } from 'vitest';
import {
  buildAnthropicRequestParams,
  checkAuth,
  parseAnthropicToolResult,
  parseRecognizeRequestBody,
  RecognizeRequestError,
} from './recognize';

describe('checkAuth', () => {
  it('returns true when the provided secret matches', () => {
    expect(checkAuth('shh', 'shh')).toBe(true);
  });

  it('returns false when the header is missing', () => {
    expect(checkAuth(null, 'shh')).toBe(false);
  });

  it('returns false when the secret does not match', () => {
    expect(checkAuth('wrong', 'shh')).toBe(false);
  });
});

describe('parseRecognizeRequestBody', () => {
  it('accepts a valid body', () => {
    const body = parseRecognizeRequestBody({ image: 'abc', productNames: ['Rice'] });
    expect(body).toEqual({ image: 'abc', productNames: ['Rice'] });
  });

  it('rejects a missing image', () => {
    expect(() => parseRecognizeRequestBody({ productNames: [] })).toThrow(RecognizeRequestError);
  });

  it('rejects an empty-string image', () => {
    expect(() => parseRecognizeRequestBody({ image: '', productNames: [] })).toThrow(RecognizeRequestError);
  });

  it('rejects non-string productNames entries', () => {
    expect(() => parseRecognizeRequestBody({ image: 'abc', productNames: [1] })).toThrow(RecognizeRequestError);
  });

  it('rejects a non-object body', () => {
    expect(() => parseRecognizeRequestBody('nope')).toThrow(RecognizeRequestError);
  });

  it('rejects an image string over the size ceiling', () => {
    const hugeImage = 'a'.repeat(14_000_001);
    expect(() => parseRecognizeRequestBody({ image: hugeImage, productNames: [] })).toThrow(RecognizeRequestError);
  });

  it('accepts an image string right at the size ceiling', () => {
    const maxImage = 'a'.repeat(14_000_000);
    expect(() => parseRecognizeRequestBody({ image: maxImage, productNames: [] })).not.toThrow();
  });
});

describe('buildAnthropicRequestParams', () => {
  it('forces the recognition tool via tool_choice', () => {
    const params = buildAnthropicRequestParams({ image: 'abc', productNames: ['Rice'] });
    expect(params.tool_choice).toEqual({ type: 'tool', name: 'report_recognized_ingredients' });
    expect(params.tools).toHaveLength(1);
    expect(params.model).toBe('claude-haiku-4-5');
  });

  it('embeds the image as a base64 JPEG content block', () => {
    const params = buildAnthropicRequestParams({ image: 'abc', productNames: [] });
    const content = params.messages[0].content;
    const imageBlock = content.find((b) => b.type === 'image');
    expect(imageBlock).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: 'abc' },
    });
  });

  it('includes the product names in the prompt text when present', () => {
    const params = buildAnthropicRequestParams({ image: 'abc', productNames: ['Rice', 'Chicken breast'] });
    const content = params.messages[0].content;
    const textBlock = content.find((b) => b.type === 'text');
    expect(textBlock?.text).toContain('Rice');
    expect(textBlock?.text).toContain('Chicken breast');
  });

  it('includes estimatedGrams as a required, nullable field in the tool schema', () => {
    const params = buildAnthropicRequestParams({ image: 'abc', productNames: [] });
    const itemSchema = params.tools[0].input_schema.properties.items.items;
    expect(itemSchema.properties.estimatedGrams).toBeDefined();
    expect(itemSchema.properties.estimatedGrams.type).toEqual(['integer', 'null']);
    expect(itemSchema.required).toContain('estimatedGrams');
  });

  it('asks the model to estimate portion weight in the prompt text', () => {
    const params = buildAnthropicRequestParams({ image: 'abc', productNames: [] });
    const content = params.messages[0].content;
    const textBlock = content.find((b) => b.type === 'text');
    expect(textBlock?.text).toContain('grams');
  });

  it('includes dishNameSuggestions as a required array field in the tool schema', () => {
    const params = buildAnthropicRequestParams({ image: 'abc', productNames: [] });
    const schema = params.tools[0].input_schema;
    expect(schema.properties.dishNameSuggestions).toBeDefined();
    expect(schema.properties.dishNameSuggestions.type).toBe('array');
    expect(schema.required).toContain('dishNameSuggestions');
  });

  it('asks the model to suggest a dish name in the prompt text', () => {
    const params = buildAnthropicRequestParams({ image: 'abc', productNames: [] });
    const content = params.messages[0].content;
    const textBlock = content.find((b) => b.type === 'text');
    expect(textBlock?.text.toLowerCase()).toContain('name');
  });
});

describe('parseAnthropicToolResult', () => {
  it('parses matched and unmatched items', () => {
    const result = parseAnthropicToolResult(
      {
        items: [
          { name: 'Chicken breast', matchedProductName: 'Chicken breast' },
          { name: 'Sauteed spinach', matchedProductName: null },
        ],
      },
      ['Chicken breast']
    );
    expect(result.items).toEqual([
      { name: 'Chicken breast', matchedProductName: 'Chicken breast', estimatedGrams: null },
      { name: 'Sauteed spinach', matchedProductName: null, estimatedGrams: null },
    ]);
  });

  it('treats a missing items array as malformed', () => {
    expect(() => parseAnthropicToolResult({}, [])).toThrow(RecognizeRequestError);
  });

  it('treats an item missing a name as malformed', () => {
    expect(() => parseAnthropicToolResult({ items: [{ matchedProductName: null }] }, [])).toThrow(
      RecognizeRequestError
    );
  });

  it('treats a non-string, non-null matchedProductName as unmatched rather than failing', () => {
    const result = parseAnthropicToolResult({ items: [{ name: 'Rice', matchedProductName: 42 }] }, ['Rice']);
    expect(result.items).toEqual([{ name: 'Rice', matchedProductName: null, estimatedGrams: null }]);
  });

  it('resolves a case-insensitive matchedProductName to the product list exact casing', () => {
    const result = parseAnthropicToolResult({ items: [{ name: 'rice', matchedProductName: 'rice' }] }, ['Rice']);
    expect(result.items).toEqual([{ name: 'rice', matchedProductName: 'Rice', estimatedGrams: null }]);
  });

  it('nulls out a matchedProductName that is not in the supplied product list (hallucination guard)', () => {
    const result = parseAnthropicToolResult(
      { items: [{ name: 'Rice', matchedProductName: 'Fried Rice' }] },
      ['Rice']
    );
    expect(result.items).toEqual([{ name: 'Rice', matchedProductName: null, estimatedGrams: null }]);
  });
});

describe('parseAnthropicToolResult — estimatedGrams', () => {
  it('passes through a valid positive integer estimate', () => {
    const result = parseAnthropicToolResult(
      { items: [{ name: 'Rice', matchedProductName: null, estimatedGrams: 150 }] },
      []
    );
    expect(result.items).toEqual([{ name: 'Rice', matchedProductName: null, estimatedGrams: 150 }]);
  });

  it('rounds a non-integer estimate defensively', () => {
    const result = parseAnthropicToolResult(
      { items: [{ name: 'Rice', matchedProductName: null, estimatedGrams: 150.6 }] },
      []
    );
    expect(result.items[0].estimatedGrams).toBe(151);
  });

  it('nulls out an explicit null estimate', () => {
    const result = parseAnthropicToolResult(
      { items: [{ name: 'Rice', matchedProductName: null, estimatedGrams: null }] },
      []
    );
    expect(result.items[0].estimatedGrams).toBeNull();
  });

  it('nulls out a missing estimatedGrams field', () => {
    const result = parseAnthropicToolResult({ items: [{ name: 'Rice', matchedProductName: null }] }, []);
    expect(result.items[0].estimatedGrams).toBeNull();
  });

  it('nulls out a zero or negative estimate', () => {
    const result = parseAnthropicToolResult(
      { items: [{ name: 'Rice', matchedProductName: null, estimatedGrams: 0 }] },
      []
    );
    expect(result.items[0].estimatedGrams).toBeNull();
    const result2 = parseAnthropicToolResult(
      { items: [{ name: 'Rice', matchedProductName: null, estimatedGrams: -5 }] },
      []
    );
    expect(result2.items[0].estimatedGrams).toBeNull();
  });

  it('nulls out a non-numeric estimate', () => {
    const result = parseAnthropicToolResult(
      { items: [{ name: 'Rice', matchedProductName: null, estimatedGrams: 'a lot' }] },
      []
    );
    expect(result.items[0].estimatedGrams).toBeNull();
  });

  it('nulls out an estimate that rounds to zero or negative (regression: 0.3 -> rounds to 0)', () => {
    const result = parseAnthropicToolResult(
      { items: [{ name: 'Rice', matchedProductName: null, estimatedGrams: 0.3 }] },
      []
    );
    expect(result.items[0].estimatedGrams).toBeNull();
  });

  it('nulls out an implausibly large estimate (hallucination guard)', () => {
    const result = parseAnthropicToolResult(
      { items: [{ name: 'Rice', matchedProductName: null, estimatedGrams: 50000 }] },
      []
    );
    expect(result.items[0].estimatedGrams).toBeNull();
  });

  it('accepts an estimate right at the plausibility ceiling', () => {
    const result = parseAnthropicToolResult(
      { items: [{ name: 'Rice', matchedProductName: null, estimatedGrams: 5000 }] },
      []
    );
    expect(result.items[0].estimatedGrams).toBe(5000);
  });
});

describe('parseAnthropicToolResult — dishNameSuggestions', () => {
  it('passes through valid suggestions', () => {
    const result = parseAnthropicToolResult(
      { items: [], dishNameSuggestions: ['Grilled Chicken with Jollof Rice', 'Chicken and Rice Plate'] },
      []
    );
    expect(result.dishNameSuggestions).toEqual(['Grilled Chicken with Jollof Rice', 'Chicken and Rice Plate']);
  });

  it('defaults to an empty array when the field is missing', () => {
    const result = parseAnthropicToolResult({ items: [] }, []);
    expect(result.dishNameSuggestions).toEqual([]);
  });

  it('defaults to an empty array when the field is not an array', () => {
    const result = parseAnthropicToolResult({ items: [], dishNameSuggestions: 'not an array' }, []);
    expect(result.dishNameSuggestions).toEqual([]);
  });

  it('filters out non-string entries rather than failing', () => {
    const result = parseAnthropicToolResult(
      { items: [], dishNameSuggestions: ['Valid Name', 42, null, 'Another Valid Name'] },
      []
    );
    expect(result.dishNameSuggestions).toEqual(['Valid Name', 'Another Valid Name']);
  });

  it('accepts an explicit empty array', () => {
    const result = parseAnthropicToolResult({ items: [], dishNameSuggestions: [] }, []);
    expect(result.dishNameSuggestions).toEqual([]);
  });
});
