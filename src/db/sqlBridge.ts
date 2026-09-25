import { registerPlugin } from '@capacitor/core'

/** Values that cross the bridge. Blobs are stored as base64 text by the caller. */
export type SqlValue = string | number | null

export interface SqlStatement {
  sql: string
  params?: SqlValue[]
}

/**
 * Minimal SQL transport. The native app implements it with Android's
 * built-in SQLite; tests implement it with bun:sqlite.
 */
export interface SqlBridge {
  /** Run one statement (no result rows). */
  run(sql: string, params?: SqlValue[]): Promise<void>
  /** Run statements atomically, in order. */
  batch(statements: SqlStatement[]): Promise<void>
  /** Read rows as plain objects keyed by column name. */
  query<T = Record<string, SqlValue>>(sql: string, params?: SqlValue[]): Promise<T[]>
}

interface SqlitePlugin {
  run(options: { sql: string; params?: SqlValue[] }): Promise<void>
  batch(options: { statements: SqlStatement[] }): Promise<void>
  query(options: { sql: string; params?: SqlValue[] }): Promise<{ rows: Record<string, SqlValue>[] }>
}

const Sqlite = registerPlugin<SqlitePlugin>('Sqlite')

/** Bridge backed by the Capacitor Sqlite plugin (Android). */
export const capacitorSqlBridge: SqlBridge = {
  run: (sql, params = []) => Sqlite.run({ sql, params }),
  batch: (statements) => Sqlite.batch({ statements }),
  query: async <T,>(sql: string, params: SqlValue[] = []) => (await Sqlite.query({ sql, params })).rows as T[],
}
