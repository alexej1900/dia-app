jest.mock('../../src/repositories/productsRepo', () => ({
  listProducts: jest.fn(),
  setProductNameRu: jest.fn(),
}));

jest.mock('../../src/services/translateProductName', () => ({
  translateProductName: jest.fn(),
  TranslateProductNameError: class TranslateProductNameError extends Error {},
}));

import { listProducts, setProductNameRu } from '../../src/repositories/productsRepo';
import { translateProductName } from '../../src/services/translateProductName';
import { backfillProductTranslations } from '../../src/services/productTranslationBackfill';

describe('backfillProductTranslations', () => {
  const db = {} as never;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('translates and stores a name for each product missing one', async () => {
    (listProducts as jest.Mock).mockResolvedValue([
      { id: 'p1', name: 'Apple', nameRu: null },
      { id: 'p2', name: 'Rice', nameRu: null },
    ]);
    (translateProductName as jest.Mock).mockResolvedValueOnce('Яблоко').mockResolvedValueOnce('Рис');

    await backfillProductTranslations(db);

    expect(setProductNameRu).toHaveBeenCalledWith(db, 'p1', 'Яблоко');
    expect(setProductNameRu).toHaveBeenCalledWith(db, 'p2', 'Рис');
  });

  it('skips products that already have a translation', async () => {
    (listProducts as jest.Mock).mockResolvedValue([
      { id: 'p1', name: 'Apple', nameRu: 'Яблоко' },
      { id: 'p2', name: 'Rice', nameRu: null },
    ]);
    (translateProductName as jest.Mock).mockResolvedValue('Рис');

    await backfillProductTranslations(db);

    expect(translateProductName).toHaveBeenCalledTimes(1);
    expect(translateProductName).toHaveBeenCalledWith('Rice');
  });

  it('translates products one at a time, not in parallel', async () => {
    (listProducts as jest.Mock).mockResolvedValue([
      { id: 'p1', name: 'Apple', nameRu: null },
      { id: 'p2', name: 'Rice', nameRu: null },
    ]);
    const callOrder: string[] = [];
    (translateProductName as jest.Mock).mockImplementation(async (name: string) => {
      callOrder.push(`start:${name}`);
      await Promise.resolve();
      callOrder.push(`end:${name}`);
      return `${name}-ru`;
    });

    await backfillProductTranslations(db);

    expect(callOrder).toEqual(['start:Apple', 'end:Apple', 'start:Rice', 'end:Rice']);
  });

  it('does not store anything when the model cannot translate confidently', async () => {
    (listProducts as jest.Mock).mockResolvedValue([{ id: 'p1', name: 'xyzzy', nameRu: null }]);
    (translateProductName as jest.Mock).mockResolvedValue(null);

    await backfillProductTranslations(db);

    expect(setProductNameRu).not.toHaveBeenCalled();
  });

  it('continues past a translation failure for one product and still processes the rest', async () => {
    (listProducts as jest.Mock).mockResolvedValue([
      { id: 'p1', name: 'Apple', nameRu: null },
      { id: 'p2', name: 'Rice', nameRu: null },
    ]);
    (translateProductName as jest.Mock)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce('Рис');

    await expect(backfillProductTranslations(db)).resolves.not.toThrow();

    expect(setProductNameRu).toHaveBeenCalledTimes(1);
    expect(setProductNameRu).toHaveBeenCalledWith(db, 'p2', 'Рис');
  });

  it('is a no-op when no products are missing a translation', async () => {
    (listProducts as jest.Mock).mockResolvedValue([{ id: 'p1', name: 'Apple', nameRu: 'Яблоко' }]);

    await backfillProductTranslations(db);

    expect(translateProductName).not.toHaveBeenCalled();
    expect(setProductNameRu).not.toHaveBeenCalled();
  });
});
