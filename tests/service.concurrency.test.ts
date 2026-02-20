import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  __resetRandomSourceForTests,
  __setRandomSourceForTests,
  createGroup,
  getGroupSnapshot,
  resolveCurrentWeek,
  runWeeklyRollover,
} from "@/lib/service";
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

    await Promise.all(
      Array.from({ length: 6 }, () => runWeeklyRollover({ groupId: group.groupId! })),
    );

    const rows = await testDb.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM weeks
       WHERE group_id = $1`,
      [group.groupId],
    );

    expect(Number(rows.rows[0].count)).toBe(1);
  });

  it("keeps manual resolve idempotent under concurrent calls", async () => {
    const ownerId = await createUser(testDb.pool, { name: "Owner", email: "owner-resolve@example.com" });
    const group = await createGroup({
      name: "Resolve Group",
      timezone: "America/New_York",
      ownerId,
      votingDurationHours: 168,
    });

    const snapshot = await getGroupSnapshot(group.groupId!, ownerId);
    expect(snapshot.proposals.length).toBeGreaterThan(0);

    __setRandomSourceForTests(() => 0.1);
    const results = await Promise.all(
      Array.from({ length: 4 }, () => resolveCurrentWeek(group.groupId!, ownerId)),
    );

    const firstReadingId = results[0].readingItemId;
    expect(firstReadingId).toBeTruthy();
    for (const result of results) {
      expect(result.status).toBe("RESOLVED");
      expect(result.readingItemId).toBe(firstReadingId);
    }

    const readingRows = await testDb.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM reading_items
       WHERE week_id = $1`,
      [snapshot.week.id],
    );

    expect(Number(readingRows.rows[0].count)).toBe(1);
  });
});
