import * as SQLite from 'expo-sqlite';
import { SCHEMA_SQL } from './schema';
import { SqlExecutor } from './sqlExecutor';
import { seedIfEmpty } from './seed';

let dbInstance: SqlExecutor | null = null;

export async function openDatabase(): Promise<SqlExecutor> {
  if (dbInstance) return dbInstance;
  const db = await SQLite.openDatabaseAsync('diaapp.db');
  await db.execAsync(SCHEMA_SQL);
  await seedIfEmpty(db as SqlExecutor);
  dbInstance = db as SqlExecutor;
  return dbInstance;
}
