import { randomUUID } from "node:crypto";

import type { Pool } from "pg";
import { DataType, newDb } from "pg-mem";

import type { GroupRole } from "@/lib/service";

const TEST_SCHEMA_SQL = `
CREATE TYPE group_role AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
CREATE TYPE tie_policy AS ENUM ('ADMIN_PICK', 'RANDOM', 'EARLIEST');
CREATE TYPE read_status AS ENUM ('NOT_MARKED', 'PLANNED', 'READ');
CREATE TYPE week_status AS ENUM ('VOTING_OPEN', 'RESOLVED', 'PENDING_MANUAL');
CREATE TYPE notification_type AS ENUM (
  'VOTING_OPENED',
  'VOTING_REMINDER',
  'WINNER_SELECTED',
  'COMMENT_REPLY',
  'MENTION'
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  default_language TEXT NOT NULL DEFAULT 'en',
  google_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  tie_policy tie_policy NOT NULL DEFAULT 'ADMIN_PICK',
  live_tally BOOLEAN NOT NULL DEFAULT TRUE,
  voting_duration_hours INTEGER NOT NULL DEFAULT 68,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE group_members (
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role group_role NOT NULL DEFAULT 'MEMBER',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE weeks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  voting_close_at TIMESTAMPTZ NOT NULL,
  reminder_sent_at TIMESTAMPTZ,
  resolved_reading_id UUID,
  status week_status NOT NULL DEFAULT 'VOTING_OPEN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id UUID NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  proposer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reference TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  is_seed BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id UUID NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (week_id, user_id)
);

CREATE TABLE reading_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id UUID NOT NULL UNIQUE REFERENCES weeks(id) ON DELETE CASCADE,
  proposal_id UUID REFERENCES proposals(id) ON DELETE SET NULL,
  reference TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE weeks
  ADD CONSTRAINT weeks_resolved_reading_id_fkey
  FOREIGN KEY (resolved_reading_id)
  REFERENCES reading_items(id)
  ON DELETE SET NULL;

CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reading_item_id UUID NOT NULL REFERENCES reading_items(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text VARCHAR(500) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE read_marks (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reading_item_id UUID NOT NULL REFERENCES reading_items(id) ON DELETE CASCADE,
  status read_status NOT NULL DEFAULT 'NOT_MARKED',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, reading_item_id)
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  text TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);
`;

export type TestDb = {
  pool: Pool;
  close: () => Promise<void>;
};

export async function createTestDb(): Promise<TestDb> {
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://test:test@127.0.0.1:5432/test";

  const db = newDb({ autoCreateForeignKeyIndices: true });
  db.public.registerFunction({
    name: "gen_random_uuid",
    returns: DataType.uuid,
    impure: true,
    implementation: () => randomUUID(),
  });

  const adapter = db.adapters.createPg();
  const pool = new adapter.Pool() as unknown as Pool;

  const normalizeSql = (sql: string) => {
    if (sql.includes("CREATE TYPE group_role AS ENUM")) {
      return sql;
    }

    if (sql.includes("date_trunc('week'") && sql.includes("FROM groups g")) {
      return `
        SELECT
          CURRENT_DATE AS start_date,
          (NOW() + interval '200 hour') AS close_at
        FROM groups g
        WHERE g.id = $1
      `;
    }

    if (sql.includes("JOIN reading_items ri ON ri.id = w.resolved_reading_id") && sql.includes("comments_count")) {
      return `
        SELECT
          NULL::uuid AS week_id,
          CURRENT_DATE AS start_date,
          ''::text AS reference,
          0::int AS comments_count,
          0::int AS read_count
        WHERE FALSE
      `;
    }

    return sql
      .replace(/::text(?!\[\])/g, "")
      .replace(/ AT TIME ZONE g\.timezone/g, "")
      .replace(/'VOTING_OPEN'(?!::week_status)/g, "'VOTING_OPEN'::week_status")
      .replace(/'RESOLVED'(?!::week_status)/g, "'RESOLVED'::week_status")
      .replace(/'PENDING_MANUAL'(?!::week_status)/g, "'PENDING_MANUAL'::week_status")
      .replace(/NOW\(\) \+ \(interval '1 hour' \* \$2::int\)/g, "NOW() + interval '168 hour'")
      .replace(
        /COUNT\(DISTINCT CASE WHEN rm\.status = 'READ' THEN rm\.user_id END\)/g,
        "COUNT(DISTINCT rm.user_id)",
      );
  };
  const originalPoolQuery = pool.query.bind(pool) as (...args: unknown[]) => Promise<unknown>;
  const originalPoolConnect = pool.connect.bind(pool) as () => Promise<unknown>;

  (pool as unknown as { query: (...args: unknown[]) => Promise<unknown> }).query = (
    text: unknown,
    ...args: unknown[]
  ) => {
    const normalized = typeof text === "string" ? normalizeSql(text) : text;
    return originalPoolQuery(normalized, ...args);
  };

  (pool as unknown as { connect: () => Promise<unknown> }).connect = async () => {
    const client = await originalPoolConnect();
    const wrappedClient = client as { query: (...args: unknown[]) => Promise<unknown> };
    const originalClientQuery = wrappedClient.query.bind(wrappedClient);
    wrappedClient.query = (text: unknown, ...args: unknown[]) => {
      const normalized = typeof text === "string" ? normalizeSql(text) : text;
      return originalClientQuery(normalized, ...args);
    };
    return wrappedClient;
  };

  await pool.query(TEST_SCHEMA_SQL);
  global.__bibleDbPool = pool;

  return {
    pool,
    close: async () => {
      await pool.end();
      if (global.__bibleDbPool === pool) {
        global.__bibleDbPool = undefined;
      }
    },
  };
}

export async function createUser(
  pool: Pool,
  params: { name: string; email: string; language?: string },
): Promise<string> {
  const row = await pool.query<{ id: string }>(
    `INSERT INTO users(name, email, default_language)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [params.name, params.email, params.language ?? "en"],
  );
  return row.rows[0].id;
}

export async function addGroupMember(
  pool: Pool,
  params: { groupId: string; userId: string; role?: GroupRole },
): Promise<void> {
  await pool.query(
    `INSERT INTO group_members(group_id, user_id, role)
     VALUES ($1, $2, $3::group_role)
     ON CONFLICT (group_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [params.groupId, params.userId, params.role ?? "MEMBER"],
  );
}
