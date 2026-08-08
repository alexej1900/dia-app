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
});

describe('parseAnthropicToolResult', () => {
  it('parses matched and unmatched items', () => {
    const items = parseAnthropicToolResult({
      items: [
        { name: 'Chicken breast', matchedProductName: 'Chicken breast' },
        { name: 'Sauteed spinach', matchedProductName: null },
      ],
    });
    expect(items).toEqual([
      { name: 'Chicken breast', matchedProductName: 'Chicken breast' },
      { name: 'Sauteed spinach', matchedProductName: null },
    ]);
  });

  it('treats a missing items array as malformed', () => {
    expect(() => parseAnthropicToolResult({})).toThrow(RecognizeRequestError);
  });

  it('treats an item missing a name as malformed', () => {
    expect(() => parseAnthropicToolResult({ items: [{ matchedProductName: null }] })).toThrow(
      RecognizeRequestError
    );
  });

  it('treats a non-string, non-null matchedProductName as unmatched rather than failing', () => {
    const items = parseAnthropicToolResult({ items: [{ name: 'Rice', matchedProductName: 42 }] });
    expect(items).toEqual([{ name: 'Rice', matchedProductName: null }]);
  });
});
