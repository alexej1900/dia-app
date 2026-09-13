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
  photo_uri TEXT,
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
// defensively. We check PRAGMA table_info for the column's presence rather than trying
// the ALTER and swallowing a "duplicate column" error: this runs on every app launch,
// and matching an error message's exact wording isn't reliable across the different
// SQLite drivers this app runs on (native iOS/Android via expo-sqlite, web via
// wa-sqlite, sql.js in tests). Checking reality directly avoids that dependency.
export async function migrateSchema(db: SqlExecutor): Promise<void> {
  const dishItemsColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(dish_items)');
  if (!dishItemsColumns.some((c) => c.name === 'is_estimated')) {
    await db.execAsync('ALTER TABLE dish_items ADD COLUMN is_estimated INTEGER NOT NULL DEFAULT 0');
  }

  const dishesColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(dishes)');
  if (!dishesColumns.some((c) => c.name === 'photo_uri')) {
    await db.execAsync('ALTER TABLE dishes ADD COLUMN photo_uri TEXT');
  }
}
