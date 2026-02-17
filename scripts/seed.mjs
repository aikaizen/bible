import process from "node:process";
import crypto from "node:crypto";
import pg from "pg";

const { Pool } = pg;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const pool = new Pool({ connectionString });

  try {
    await pool.query("BEGIN");

    const usersSeed = [
      { name: "Adil", email: "adil@example.com", lang: "en" },
      { name: "Marcus", email: "marcus@example.com", lang: "en" },
      { name: "Sarah", email: "sarah@example.com", lang: "es" },
      { name: "David", email: "david@example.com", lang: "en" },
      { name: "Priya", email: "priya@example.com", lang: "hi" },
      { name: "Noah", email: "noah@example.com", lang: "fr" }
    ];

    const userIds = new Map();
    for (const user of usersSeed) {
      const result = await pool.query(
        `INSERT INTO users(name, email, default_language)
         VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE
         SET name = EXCLUDED.name,
             default_language = EXCLUDED.default_language
         RETURNING id`,
        [user.name, user.email, user.lang]
      );
      userIds.set(user.email, result.rows[0].id);
    }

    const ownerId = userIds.get("adil@example.com");
    const groupResult = await pool.query(
      `INSERT INTO groups(name, timezone, owner_id, tie_policy, live_tally)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      ["Friends Group", "America/New_York", ownerId, "EARLIEST", true]
    );

    let groupId = groupResult.rows[0]?.id;
    if (!groupId) {
      const existing = await pool.query("SELECT id FROM groups WHERE name = $1 ORDER BY created_at ASC LIMIT 1", ["Friends Group"]);
      groupId = existing.rows[0].id;
    }

    const groupMembers = [
      ["adil@example.com", "OWNER"],
      ["marcus@example.com", "MEMBER"],
      ["sarah@example.com", "MEMBER"],
      ["david@example.com", "MEMBER"],
      ["priya@example.com", "MEMBER"]
    ];

    for (const [email, role] of groupMembers) {
      await pool.query(
        `INSERT INTO group_members(group_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (group_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
        [groupId, userIds.get(email), role]
      );
    }

    await pool.query(
      `INSERT INTO invites(group_id, token, created_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (token) DO NOTHING`,
      [groupId, "friends-group", ownerId]
    );

    const weekMeta = await pool.query(
      `SELECT
         date_trunc('week', now() AT TIME ZONE g.timezone)::date AS start_date,
         ((date_trunc('week', now() AT TIME ZONE g.timezone) + interval '2 days 20 hours') AT TIME ZONE g.timezone) AS close_at
       FROM groups g
       WHERE g.id = $1`,
      [groupId]
    );

    const startDate = weekMeta.rows[0].start_date;
    const closeAt = weekMeta.rows[0].close_at;

    const weekResult = await pool.query(
      `INSERT INTO weeks(group_id, start_date, voting_close_at, status)
       VALUES ($1, $2, $3, 'VOTING_OPEN')
       ON CONFLICT (group_id, start_date) DO UPDATE
       SET voting_close_at = EXCLUDED.voting_close_at
       RETURNING id`,
      [groupId, startDate, closeAt]
    );
    const weekId = weekResult.rows[0].id;

    const proposals = [
      ["marcus@example.com", "1 Kings 18:20-40", "Elijah and prophets of Baal"],
      ["sarah@example.com", "Genesis 32:22-32", "Jacob wrestles with God"],
      ["adil@example.com", "John 2:13-22", "Jesus clears the temple"],
      ["david@example.com", "Acts 5:1-11", "Ananias and Sapphira"],
    ];

    for (const [email, reference, note] of proposals) {
      await pool.query(
        `INSERT INTO proposals(week_id, proposer_id, reference, note)
         SELECT $1, $2, $3, $4
         WHERE NOT EXISTS (
           SELECT 1 FROM proposals WHERE week_id = $1 AND proposer_id = $2 AND reference = $3
         )`,
        [weekId, userIds.get(email), reference, note]
      );
    }

    const proposalRows = await pool.query(
      "SELECT id, reference FROM proposals WHERE week_id = $1 AND deleted_at IS NULL",
      [weekId]
    );

    const byRef = Object.fromEntries(proposalRows.rows.map((row) => [row.reference, row.id]));

    const votes = [
      ["adil@example.com", "John 2:13-22"],
      ["marcus@example.com", "1 Kings 18:20-40"],
      ["sarah@example.com", "Genesis 32:22-32"],
      ["david@example.com", "John 2:13-22"],
      ["priya@example.com", "1 Kings 18:20-40"]
    ];

    for (const [email, ref] of votes) {
      const proposalId = byRef[ref];
      if (!proposalId) continue;
      await pool.query(
        `INSERT INTO votes(week_id, proposal_id, user_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (week_id, user_id) DO UPDATE SET proposal_id = EXCLUDED.proposal_id, created_at = NOW()`,
        [weekId, proposalId, userIds.get(email)]
      );
    }

    await pool.query(
      `INSERT INTO notifications(user_id, type, text, metadata)
       VALUES
       ($1, 'VOTING_OPENED', 'Voting is open for this week', $2::jsonb),
       ($3, 'VOTING_REMINDER', '24h reminder: cast your vote', $2::jsonb)
       ON CONFLICT DO NOTHING`,
      [userIds.get("adil@example.com"), JSON.stringify({ groupId, weekId }), userIds.get("marcus@example.com")]
    );

    await pool.query("COMMIT");

    console.log("Seed complete");
    console.log(`Group invite token: friends-group`);
    console.log(`Fallback invite token: ${crypto.randomBytes(4).toString("hex")}`);
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
