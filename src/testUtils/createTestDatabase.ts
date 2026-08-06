import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { SCHEMA_SQL } from '../db/schema';
import { SqlExecutor, SqlRunResult } from '../db/sqlExecutor';

export async function createTestDatabase(): Promise<SqlExecutor> {
  const SQL = await initSqlJs();
  const raw: SqlJsDatabase = new SQL.Database();
  raw.run(SCHEMA_SQL);

  return {
    async execAsync(sql: string): Promise<void> {
      raw.run(sql);
    },
    async runAsync(sql: string, params: unknown[] = []): Promise<SqlRunResult> {
      raw.run(sql, params as any);
      const changes = raw.getRowsModified();
      const idResult = raw.exec('SELECT last_insert_rowid() AS id');
      const lastInsertRowId = idResult.length > 0 ? Number(idResult[0].values[0][0]) : 0;
      return { lastInsertRowId, changes };
    },
    async getAllAsync<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      const stmt = raw.prepare(sql);
      stmt.bind(params as any);
      const rows: T[] = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as T);
      }
      stmt.free();
      return rows;
    },
    async getFirstAsync<T>(sql: string, params: unknown[] = []): Promise<T | null> {
      const stmt = raw.prepare(sql);
      stmt.bind(params as any);
      const hasRow = stmt.step();
      const row = hasRow ? (stmt.getAsObject() as T) : null;
      stmt.free();
      return row;
    },
  };
}
