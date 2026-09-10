import * as SQLite from 'expo-sqlite';
import { SCHEMA_SQL, migrateSchema } from './schema';
import { SqlExecutor } from './sqlExecutor';
import { seedIfEmpty } from './seed';

let dbPromise: Promise<SqlExecutor> | null = null;

export function openDatabase(): Promise<SqlExecutor> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('carbsnap.db');
      await db.execAsync(SCHEMA_SQL);
      await migrateSchema(db as SqlExecutor);
      await seedIfEmpty(db as SqlExecutor);
      return db as SqlExecutor;
    })();
  }
  return dbPromise;
}
