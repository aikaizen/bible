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

  // Note: the seed exclusion list is intentionally NOT "every reference ever proposed"
  // (that exhausts the curated pool in months — see finding C1). It is only what the
  // community engaged with: the passage a past week resolved to, plus anything voted on.
  // Untouched suggestions stay recyclable, so this test pins engaged-novelty, not
  // global-novelty.
  it("creates a fresh seed list on rollover that does not reuse the prior week's resolved passage", async () => {
    const ownerId = await createUser(testDb.pool, { name: "Owner", email: "owner-no-votes@example.com" });
    const group = await createGroup({
      name: "No Vote Group",
      timezone: "America/New_York",
      ownerId,
      votingDurationHours: 168,
    });

    const snapshot = await getGroupSnapshot(group.groupId!, ownerId);
    expect(snapshot.proposals.length).toBeGreaterThan(1);

    await testDb.pool.query(`UPDATE weeks SET voting_close_at = NOW() - interval '1 hour' WHERE id = $1`, [
      snapshot.week.id,
    ]);
    const next = await getGroupSnapshot(group.groupId!, ownerId);

    expect(next.week.id).not.toBe(snapshot.week.id);
    expect(next.proposals.length).toBeGreaterThan(0);

    const resolved = await testDb.pool.query<{ reference: string }>(
      `SELECT ri.reference FROM weeks w JOIN reading_items ri ON ri.id = w.resolved_reading_id WHERE w.id = $1`,
      [snapshot.week.id],
    );
    expect(resolved.rows.length).toBe(1);
    const resolvedRef = resolved.rows[0].reference;
    for (const p of next.proposals) {
      expect(p.reference).not.toBe(resolvedRef);
    }
  });

  it("does not exclude passages that were merely suggested and ignored", async () => {
    const ownerId = await createUser(testDb.pool, { name: "Owner", email: "owner-recycle@example.com" });
    const group = await createGroup({
      name: "Recycle Group",
      timezone: "America/New_York",
      ownerId,
      votingDurationHours: 168,
    });

    const snapshot = await getGroupSnapshot(group.groupId!, ownerId);
    const resolvedBefore = snapshot.proposals.map((p) => p.reference);

    await testDb.pool.query(`UPDATE weeks SET voting_close_at = NOW() - interval '1 hour' WHERE id = $1`, [
      snapshot.week.id,
    ]);
    const next = await getGroupSnapshot(group.groupId!, ownerId);

    // At least one untouched (never voted, never resolved) suggestion is offered again.
    const recycled = next.proposals.filter((p) => resolvedBefore.includes(p.reference));
    expect(recycled.length).toBeGreaterThan(0);
  });
});
