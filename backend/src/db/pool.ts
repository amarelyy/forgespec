import { Pool } from 'pg';

export interface Queryable {
  query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[]; rowCount: number | null }>;
}

export interface Db extends Queryable {
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Wraps any pg-compatible Pool (real pg, or pg-mem's adapter in tests). */
export function dbFromPool(pool: Pool): Db {
  return {
    query: (sql, params) => pool.query(sql, params) as any,
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(client as unknown as Queryable);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

export function createPgDb(connectionString: string): Db {
  return dbFromPool(new Pool({ connectionString }));
}

export async function one<T>(q: Queryable, sql: string, params: any[] = []): Promise<T | undefined> {
  const { rows } = await q.query<T>(sql, params);
  return rows[0];
}

export async function many<T>(q: Queryable, sql: string, params: any[] = []): Promise<T[]> {
  return (await q.query<T>(sql, params)).rows;
}

/** jsonb params must be stringified: node-pg would turn arrays into PG arrays. */
export const json = (value: unknown) => JSON.stringify(value ?? null);
