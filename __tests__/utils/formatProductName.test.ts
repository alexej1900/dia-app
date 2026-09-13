import { formatProductName } from '../../src/utils/formatProductName';

describe('formatProductName', () => {
  it('appends the Russian name in brackets when present', () => {
    expect(formatProductName({ name: 'Apple', nameRu: 'Яблоко' })).toBe('Apple (Яблоко)');
  });

  it('returns just the name when there is no Russian translation', () => {
    expect(formatProductName({ name: 'Apple', nameRu: null })).toBe('Apple');
  });
});
