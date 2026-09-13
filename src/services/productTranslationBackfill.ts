import { SqlExecutor } from '../db/sqlExecutor';
import { listProducts, setProductNameRu } from '../repositories/productsRepo';
import { translateProductName } from './translateProductName';

// Translated sequentially, not in parallel, to avoid bursting the Worker's
// Anthropic rate limit with one call per missing product at once.
export async function backfillProductTranslations(db: SqlExecutor): Promise<void> {
  const products = await listProducts(db, '');
  const missing = products.filter((p) => p.nameRu === null);

  for (const product of missing) {
    let translated: string | null;
    try {
      translated = await translateProductName(product.name);
    } catch {
      // Best-effort: leave this product's nameRu null so a future backfill
      // pass picks it up again; one failure must not abort the whole batch.
      continue;
    }
    if (translated) {
      await setProductNameRu(db, product.id, translated);
    }
  }
}
