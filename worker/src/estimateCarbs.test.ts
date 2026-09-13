import { describe, expect, it } from 'vitest';
import {
  buildAnthropicRequestParams,
  parseAnthropicToolResult,
  parseEstimateCarbsRequestBody,
  EstimateCarbsRequestError,
} from './estimateCarbs';

describe('parseEstimateCarbsRequestBody', () => {
  it('accepts a valid body', () => {
    const body = parseEstimateCarbsRequestBody({ name: 'Sesame seed bun' });
    expect(body).toEqual({ name: 'Sesame seed bun' });
  });

  it('trims the name', () => {
    const body = parseEstimateCarbsRequestBody({ name: '  Rice  ' });
    expect(body).toEqual({ name: 'Rice' });
  });

  it('rejects a missing name', () => {
    expect(() => parseEstimateCarbsRequestBody({})).toThrow(EstimateCarbsRequestError);
  });

  it('rejects an empty-string name', () => {
    expect(() => parseEstimateCarbsRequestBody({ name: '' })).toThrow(EstimateCarbsRequestError);
  });

  it('rejects a whitespace-only name', () => {
    expect(() => parseEstimateCarbsRequestBody({ name: '   ' })).toThrow(EstimateCarbsRequestError);
  });

  it('rejects a non-object body', () => {
    expect(() => parseEstimateCarbsRequestBody('nope')).toThrow(EstimateCarbsRequestError);
  });

  it('rejects a name over the length ceiling', () => {
    const hugeName = 'a'.repeat(201);
    expect(() => parseEstimateCarbsRequestBody({ name: hugeName })).toThrow(EstimateCarbsRequestError);
  });

  it('accepts a name right at the length ceiling', () => {
    const maxName = 'a'.repeat(200);
    expect(() => parseEstimateCarbsRequestBody({ name: maxName })).not.toThrow();
  });
});

describe('buildAnthropicRequestParams', () => {
  it('forces the estimate tool via tool_choice', () => {
    const params = buildAnthropicRequestParams({ name: 'Sesame seed bun' });
    expect(params.tool_choice).toEqual({ type: 'tool', name: 'report_carb_estimate' });
    expect(params.tools).toHaveLength(1);
    expect(params.model).toBe('claude-haiku-4-5');
  });

  it('includes the food name in the prompt text', () => {
    const params = buildAnthropicRequestParams({ name: 'Sesame seed bun' });
    const textBlock = params.messages[0].content;
    expect(textBlock).toContain('Sesame seed bun');
  });

  it('includes carbsPer100g as a required, nullable field in the tool schema', () => {
    const params = buildAnthropicRequestParams({ name: 'Rice' });
    const schema = params.tools[0].input_schema;
    expect(schema.properties.carbsPer100g).toBeDefined();
    expect(schema.properties.carbsPer100g.type).toEqual(['number', 'null']);
    expect(schema.required).toContain('carbsPer100g');
  });

  it('tells the model to report null rather than guess when unsure', () => {
    const params = buildAnthropicRequestParams({ name: 'Rice' });
    const textBlock = params.messages[0].content;
    expect(textBlock).toContain('null');
  });
});

describe('parseAnthropicToolResult', () => {
  it('passes through a valid estimate', () => {
    const result = parseAnthropicToolResult({ carbsPer100g: 42.5 });
    expect(result).toEqual({ carbsPer100g: 42.5 });
  });

  it('passes through an explicit null estimate', () => {
    const result = parseAnthropicToolResult({ carbsPer100g: null });
    expect(result).toEqual({ carbsPer100g: null });
  });

  it('nulls out a missing carbsPer100g field', () => {
    const result = parseAnthropicToolResult({});
    expect(result).toEqual({ carbsPer100g: null });
  });

  it('nulls out a non-numeric estimate', () => {
    const result = parseAnthropicToolResult({ carbsPer100g: 'a lot' });
    expect(result).toEqual({ carbsPer100g: null });
  });

  it('nulls out a negative estimate', () => {
    const result = parseAnthropicToolResult({ carbsPer100g: -5 });
    expect(result).toEqual({ carbsPer100g: null });
  });

  it('accepts a zero estimate', () => {
    const result = parseAnthropicToolResult({ carbsPer100g: 0 });
    expect(result).toEqual({ carbsPer100g: 0 });
  });

  it('nulls out an implausibly large estimate (hallucination guard)', () => {
    const result = parseAnthropicToolResult({ carbsPer100g: 500 });
    expect(result).toEqual({ carbsPer100g: null });
  });

  it('accepts an estimate right at the plausibility ceiling', () => {
    const result = parseAnthropicToolResult({ carbsPer100g: 100 });
    expect(result).toEqual({ carbsPer100g: 100 });
  });

  it('treats a non-object input as malformed', () => {
    expect(() => parseAnthropicToolResult('nope')).toThrow(EstimateCarbsRequestError);
  });
});
