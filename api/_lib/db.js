import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.warn('[PlanDoSee] DATABASE_URL is not configured.');
}

const globalKey = '__plandosee_pg_pool__';
const isLocal = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '');

export const pool = globalThis[globalKey] || new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: 4,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 8_000,
});

if (!globalThis[globalKey]) globalThis[globalKey] = pool;

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
