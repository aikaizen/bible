import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { __resetRandomSourceForTests, createGroup, getGroupSnapshot } from "@/lib/service";
import { createTestDb, createUser, type TestDb } from "@/tests/helpers/test-db";

describe("service rollover seeds", () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createTestDb();
    __resetRandomSourceForTests();
  });

  afterEach(async () => {
    __resetRandomSourceForTests();
    await testDb.close();
  });

  it("creates a fresh seed list on rollover that does not reuse the prior week's passages", async () => {
    const ownerId = await createUser(testDb.pool, { name: "Owner", email: "owner-no-votes@example.com" });
    const group = await createGroup({
      name: "No Vote Group",
      timezone: "America/New_York",
      ownerId,
      votingDurationHours: 168,
    });

    const snapshot = await getGroupSnapshot(group.groupId!, ownerId);
    expect(snapshot.proposals.length).toBeGreaterThan(1);
    const priorRefs = snapshot.proposals.map((p) => p.reference);

    await testDb.pool.query(`UPDATE weeks SET voting_close_at = NOW() - interval '1 hour' WHERE id = $1`, [
      snapshot.week.id,
    ]);
    const next = await getGroupSnapshot(group.groupId!, ownerId);

    expect(next.week.id).not.toBe(snapshot.week.id);
    expect(next.proposals.length).toBeGreaterThan(0);
    for (const p of next.proposals) {
      expect(priorRefs).not.toContain(p.reference);
    }
  });
});
