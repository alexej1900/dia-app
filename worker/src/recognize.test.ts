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
});

describe('parseAnthropicToolResult', () => {
  it('parses matched and unmatched items', () => {
    const items = parseAnthropicToolResult(
      {
        items: [
          { name: 'Chicken breast', matchedProductName: 'Chicken breast' },
          { name: 'Sauteed spinach', matchedProductName: null },
        ],
      },
      ['Chicken breast']
    );
    expect(items).toEqual([
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
    const items = parseAnthropicToolResult({ items: [{ name: 'Rice', matchedProductName: 42 }] }, ['Rice']);
    expect(items).toEqual([{ name: 'Rice', matchedProductName: null, estimatedGrams: null }]);
  });

  it('resolves a case-insensitive matchedProductName to the product list exact casing', () => {
    const items = parseAnthropicToolResult({ items: [{ name: 'rice', matchedProductName: 'rice' }] }, ['Rice']);
    expect(items).toEqual([{ name: 'rice', matchedProductName: 'Rice', estimatedGrams: null }]);
  });

  it('nulls out a matchedProductName that is not in the supplied product list (hallucination guard)', () => {
    const items = parseAnthropicToolResult(
      { items: [{ name: 'Rice', matchedProductName: 'Fried Rice' }] },
      ['Rice']
    );
    expect(items).toEqual([{ name: 'Rice', matchedProductName: null, estimatedGrams: null }]);
  });
});

describe('parseAnthropicToolResult — estimatedGrams', () => {
  it('passes through a valid positive integer estimate', () => {
    const items = parseAnthropicToolResult(
      { items: [{ name: 'Rice', matchedProductName: null, estimatedGrams: 150 }] },
      []
    );
    expect(items).toEqual([{ name: 'Rice', matchedProductName: null, estimatedGrams: 150 }]);
  });

  it('rounds a non-integer estimate defensively', () => {
    const items = parseAnthropicToolResult(
      { items: [{ name: 'Rice', matchedProductName: null, estimatedGrams: 150.6 }] },
      []
    );
    expect(items[0].estimatedGrams).toBe(151);
  });

  it('nulls out an explicit null estimate', () => {
    const items = parseAnthropicToolResult(
      { items: [{ name: 'Rice', matchedProductName: null, estimatedGrams: null }] },
      []
    );
    expect(items[0].estimatedGrams).toBeNull();
  });

  it('nulls out a missing estimatedGrams field', () => {
    const items = parseAnthropicToolResult({ items: [{ name: 'Rice', matchedProductName: null }] }, []);
    expect(items[0].estimatedGrams).toBeNull();
  });

  it('nulls out a zero or negative estimate', () => {
    const items = parseAnthropicToolResult(
      { items: [{ name: 'Rice', matchedProductName: null, estimatedGrams: 0 }] },
      []
    );
    expect(items[0].estimatedGrams).toBeNull();
    const items2 = parseAnthropicToolResult(
      { items: [{ name: 'Rice', matchedProductName: null, estimatedGrams: -5 }] },
      []
    );
    expect(items2[0].estimatedGrams).toBeNull();
  });

  it('nulls out a non-numeric estimate', () => {
    const items = parseAnthropicToolResult(
      { items: [{ name: 'Rice', matchedProductName: null, estimatedGrams: 'a lot' }] },
      []
    );
    expect(items[0].estimatedGrams).toBeNull();
  });

  it('nulls out an estimate that rounds to zero or negative (regression: 0.3 -> rounds to 0)', () => {
    const items = parseAnthropicToolResult(
      { items: [{ name: 'Rice', matchedProductName: null, estimatedGrams: 0.3 }] },
      []
    );
    expect(items[0].estimatedGrams).toBeNull();
  });

  it('nulls out an implausibly large estimate (hallucination guard)', () => {
    const items = parseAnthropicToolResult(
      { items: [{ name: 'Rice', matchedProductName: null, estimatedGrams: 50000 }] },
      []
    );
    expect(items[0].estimatedGrams).toBeNull();
  });

  it('accepts an estimate right at the plausibility ceiling', () => {
    const items = parseAnthropicToolResult(
      { items: [{ name: 'Rice', matchedProductName: null, estimatedGrams: 5000 }] },
      []
    );
    expect(items[0].estimatedGrams).toBe(5000);
  });
});
