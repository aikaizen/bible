import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { __resetRandomSourceForTests, castVote, createGroup, getGroupSnapshot } from "@/lib/service";
import { addGroupMember, createTestDb, createUser, type TestDb } from "@/tests/helpers/test-db";

describe("service lifecycle", () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createTestDb();
    __resetRandomSourceForTests();
  });

  afterEach(async () => {
    __resetRandomSourceForTests();
    await testDb.close();
  });

  it("archives the week at rollover and starts a fresh one with new seeds", async () => {
    const ownerId = await createUser(testDb.pool, { name: "Owner", email: "owner@example.com" });
    const memberId = await createUser(testDb.pool, { name: "Member", email: "member@example.com" });

    const group = await createGroup({
      name: "Friends",
      timezone: "America/New_York",
      ownerId,
      votingDurationHours: 168,
    });

    await addGroupMember(testDb.pool, { groupId: group.groupId!, userId: memberId, role: "MEMBER" });

    const first = await getGroupSnapshot(group.groupId!, ownerId);
    expect(first.week.status).toBe("VOTING_OPEN");
    expect(first.readingItem).not.toBeNull();
    expect(first.proposals.length).toBeGreaterThan(0);
    const firstWeekId = first.week.id;
    const firstProposalIds = first.proposals.map((p) => p.id);

    const firstVote = await castVote({
      groupId: group.groupId!,
      userId: ownerId,
      proposalId: firstProposalIds[0],
    });
    expect(firstVote.voted).toBe(true);

    const secondVote = await castVote({
      groupId: group.groupId!,
      userId: memberId,
      proposalId: firstProposalIds[0],
    });
    expect(secondVote.voted).toBe(true);

    const openWeek = await getGroupSnapshot(group.groupId!, ownerId);
    expect(openWeek.week.status).toBe("VOTING_OPEN");
    expect(openWeek.week.id).toBe(firstWeekId);

    await testDb.pool.query(`UPDATE weeks SET voting_close_at = NOW() - interval '1 hour' WHERE id = $1`, [
      firstWeekId,
    ]);
    const next = await getGroupSnapshot(group.groupId!, ownerId);

    expect(next.week.id).not.toBe(firstWeekId);
    expect(next.week.status).toBe("VOTING_OPEN");
    expect(next.proposals.length).toBeGreaterThan(0);
    for (const p of next.proposals) expect(firstProposalIds).not.toContain(p.id);

    const oldWeek = await testDb.pool.query(`SELECT status::text FROM weeks WHERE id = $1`, [firstWeekId]);
    expect(oldWeek.rows[0].status).toBe("RESOLVED");
    const archived = await testDb.pool.query(
      `SELECT COUNT(*)::int AS n FROM proposals WHERE week_id = $1 AND archived_at IS NULL AND deleted_at IS NULL`,
      [firstWeekId],
    );
    expect(archived.rows[0].n).toBe(0);
  });
});
