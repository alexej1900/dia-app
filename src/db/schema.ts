import { SqlExecutor } from './sqlExecutor';

export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  carbs_per_100g REAL NOT NULL CHECK (carbs_per_100g >= 0),
  is_seed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dishes (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dish_items (
  dish_id TEXT NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  grams REAL NOT NULL CHECK (grams > 0),
  is_estimated INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (dish_id, product_id)
);
`;

// dish_items may already exist from before is_estimated was introduced — CREATE TABLE
// IF NOT EXISTS above won't add a column to an already-existing table, so add it here
// defensively. Swallows only "duplicate column" errors; anything else is a real failure.
export async function migrateSchema(db: SqlExecutor): Promise<void> {
  try {
    await db.execAsync('ALTER TABLE dish_items ADD COLUMN is_estimated INTEGER NOT NULL DEFAULT 0');
  } catch (e) {
    if (!(e instanceof Error) || !/duplicate column/i.test(e.message)) {
      throw e;
    }
  }
}
