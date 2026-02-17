import { Pool, PoolClient, QueryResultRow } from "pg";

type DbQueryable = Pick<Pool, "query"> | PoolClient;

declare global {
  // eslint-disable-next-line no-var
  var __bibleDbPool: Pool | undefined;
}

function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  if (!global.__bibleDbPool) {
    const isLocal =
      connectionString.includes("localhost") ||
      connectionString.includes("127.0.0.1");
    const requiresSsl =
      !isLocal ||
      connectionString.includes("sslmode=require") ||
      connectionString.includes("supabase.co");

    global.__bibleDbPool = new Pool({
      connectionString,
      ssl: requiresSsl ? { rejectUnauthorized: false } : undefined,
    });
  }

  return global.__bibleDbPool;
}

export async function dbQuery<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
  client?: DbQueryable,
): Promise<T[]> {
  const executor = client ?? getPool();
  const result = await executor.query<T>(text, params);
  return result.rows;
}

export async function dbQueryOne<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
  client?: DbQueryable,
): Promise<T | null> {
  const rows = await dbQuery<T>(text, params, client);
  return rows[0] ?? null;
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
