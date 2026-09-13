import { describe, expect, it } from 'vitest';
import {
  buildAnthropicRequestParams,
  parseAnthropicToolResult,
  parseTranslateNameRequestBody,
  TranslateNameRequestError,
} from './translateName';

describe('parseTranslateNameRequestBody', () => {
  it('accepts a valid body', () => {
    const body = parseTranslateNameRequestBody({ name: 'Apple' });
    expect(body).toEqual({ name: 'Apple' });
  });

  it('trims the name', () => {
    const body = parseTranslateNameRequestBody({ name: '  Apple  ' });
    expect(body).toEqual({ name: 'Apple' });
  });

  it('rejects a missing name', () => {
    expect(() => parseTranslateNameRequestBody({})).toThrow(TranslateNameRequestError);
  });

  it('rejects an empty-string name', () => {
    expect(() => parseTranslateNameRequestBody({ name: '' })).toThrow(TranslateNameRequestError);
  });

  it('rejects a whitespace-only name', () => {
    expect(() => parseTranslateNameRequestBody({ name: '   ' })).toThrow(TranslateNameRequestError);
  });

  it('rejects a non-object body', () => {
    expect(() => parseTranslateNameRequestBody('nope')).toThrow(TranslateNameRequestError);
  });

  it('rejects a name over the length ceiling', () => {
    const hugeName = 'a'.repeat(201);
    expect(() => parseTranslateNameRequestBody({ name: hugeName })).toThrow(TranslateNameRequestError);
  });

  it('accepts a name right at the length ceiling', () => {
    const maxName = 'a'.repeat(200);
    expect(() => parseTranslateNameRequestBody({ name: maxName })).not.toThrow();
  });
});

describe('buildAnthropicRequestParams', () => {
  it('forces the translate tool via tool_choice', () => {
    const params = buildAnthropicRequestParams({ name: 'Apple' });
    expect(params.tool_choice).toEqual({ type: 'tool', name: 'report_name_translation' });
    expect(params.tools).toHaveLength(1);
    expect(params.model).toBe('claude-haiku-4-5');
  });

  it('includes the food name in the prompt text', () => {
    const params = buildAnthropicRequestParams({ name: 'Apple' });
    const textBlock = params.messages[0].content;
    expect(textBlock).toContain('Apple');
  });

  it('mentions Russian in the prompt text', () => {
    const params = buildAnthropicRequestParams({ name: 'Apple' });
    const textBlock = params.messages[0].content;
    expect(textBlock).toContain('Russian');
  });

  it('includes translatedName as a required, nullable field in the tool schema', () => {
    const params = buildAnthropicRequestParams({ name: 'Apple' });
    const schema = params.tools[0].input_schema;
    expect(schema.properties.translatedName).toBeDefined();
    expect(schema.properties.translatedName.type).toEqual(['string', 'null']);
    expect(schema.required).toContain('translatedName');
  });

  it('tells the model to report null rather than guess when unsure', () => {
    const params = buildAnthropicRequestParams({ name: 'Apple' });
    const textBlock = params.messages[0].content;
    expect(textBlock).toContain('null');
  });
});

describe('parseAnthropicToolResult', () => {
  it('passes through a valid translation', () => {
    const result = parseAnthropicToolResult({ translatedName: 'Яблоко' });
    expect(result).toEqual({ translatedName: 'Яблоко' });
  });

  it('passes through an explicit null translation', () => {
    const result = parseAnthropicToolResult({ translatedName: null });
    expect(result).toEqual({ translatedName: null });
  });

  it('nulls out a missing translatedName field', () => {
    const result = parseAnthropicToolResult({});
    expect(result).toEqual({ translatedName: null });
  });

  it('nulls out a non-string translatedName', () => {
    const result = parseAnthropicToolResult({ translatedName: 42 });
    expect(result).toEqual({ translatedName: null });
  });

  it('nulls out a whitespace-only translatedName', () => {
    const result = parseAnthropicToolResult({ translatedName: '   ' });
    expect(result).toEqual({ translatedName: null });
  });

  it('trims a valid translation', () => {
    const result = parseAnthropicToolResult({ translatedName: '  Яблоко  ' });
    expect(result).toEqual({ translatedName: 'Яблоко' });
  });

  it('treats a non-object input as malformed', () => {
    expect(() => parseAnthropicToolResult('nope')).toThrow(TranslateNameRequestError);
  });
});
