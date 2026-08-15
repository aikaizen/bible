import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { __resetRandomSourceForTests, createGroup, getGroupSnapshot, runWeeklyRollover } from "@/lib/service";
import { createTestDb, createUser, type TestDb } from "@/tests/helpers/test-db";

describe("service concurrency and idempotency", () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createTestDb();
    __resetRandomSourceForTests();
  });

  afterEach(async () => {
    __resetRandomSourceForTests();
    await testDb.close();
  });

  it("keeps weekly rollover idempotent when triggered concurrently", async () => {
    const ownerId = await createUser(testDb.pool, { name: "Owner", email: "owner-rollover@example.com" });
    const group = await createGroup({
      name: "Rollover Group",
      timezone: "America/New_York",
      ownerId,
      votingDurationHours: 168,
    });

    await Promise.all(Array.from({ length: 6 }, () => runWeeklyRollover({ groupId: group.groupId! })));

    const rows = await testDb.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM weeks
       WHERE group_id = $1`,
      [group.groupId],
    );

    expect(Number(rows.rows[0].count)).toBe(1);
  });

  it("keeps rollover idempotent under concurrent snapshot calls", async () => {
    const ownerId = await createUser(testDb.pool, { name: "Owner", email: "c@x.com" });
    const group = await createGroup({
      name: "C",
      timezone: "America/New_York",
      ownerId,
      votingDurationHours: 168,
    });
    const snap = await getGroupSnapshot(group.groupId!, ownerId);
    await testDb.pool.query(`UPDATE weeks SET voting_close_at = NOW() - interval '1 hour' WHERE id = $1`, [
      snap.week.id,
    ]);
    await Promise.all([getGroupSnapshot(group.groupId!, ownerId), getGroupSnapshot(group.groupId!, ownerId)]);
    const weeks = await testDb.pool.query(`SELECT COUNT(*)::int AS n FROM weeks WHERE group_id = $1 AND status = 'VOTING_OPEN'`, [
      group.groupId,
    ]);
    expect(weeks.rows[0].n).toBe(1);
  });
});
