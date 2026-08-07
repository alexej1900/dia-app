import * as SQLite from 'expo-sqlite';
import { SCHEMA_SQL } from './schema';
import { SqlExecutor } from './sqlExecutor';
import { seedIfEmpty } from './seed';

let dbPromise: Promise<SqlExecutor> | null = null;

export function openDatabase(): Promise<SqlExecutor> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('diaapp.db');
      await db.execAsync(SCHEMA_SQL);
      await seedIfEmpty(db as SqlExecutor);
      return db as SqlExecutor;
    })();
  }
  return dbPromise;
}
