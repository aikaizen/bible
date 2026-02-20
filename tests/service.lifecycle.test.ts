import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  __resetRandomSourceForTests,
  castVote,
  createGroup,
  getGroupSnapshot,
  startNewVote,
} from "@/lib/service";
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

  it("creates an active week, auto-resolves when all members vote, and starts a new vote round", async () => {
    const ownerId = await createUser(testDb.pool, { name: "Owner", email: "owner@example.com" });
    const memberId = await createUser(testDb.pool, { name: "Member", email: "member@example.com" });

    const group = await createGroup({
      name: "Friends",
      timezone: "America/New_York",
      ownerId,
      votingDurationHours: 168,
    });

    await addGroupMember(testDb.pool, { groupId: group.groupId!, userId: memberId, role: "MEMBER" });

    const initial = await getGroupSnapshot(group.groupId!, ownerId);
    expect(initial.week.status).toBe("VOTING_OPEN");
    expect(initial.readingItem).not.toBeNull();
    expect(initial.proposals.length).toBeGreaterThan(0);

    const targetProposalId = initial.proposals[0].id;
    const firstVote = await castVote({ groupId: group.groupId!, userId: ownerId, proposalId: targetProposalId });
    expect(firstVote.autoResolved).toBe(false);

    const secondVote = await castVote({ groupId: group.groupId!, userId: memberId, proposalId: targetProposalId });
    expect(secondVote.autoResolved).toBe(true);

    const latestWeek = await testDb.pool.query<{ status: string; proposal_id: string | null }>(
      `SELECT w.status::text, ri.proposal_id
       FROM weeks w
       LEFT JOIN reading_items ri ON ri.id = w.resolved_reading_id
       WHERE w.group_id = $1
       ORDER BY w.created_at DESC
       LIMIT 1`,
      [group.groupId],
    );
    expect(latestWeek.rows[0].status).toBe("RESOLVED");
    expect(latestWeek.rows[0].proposal_id).toBe(targetProposalId);

    const nextWeek = await startNewVote({ groupId: group.groupId!, userId: ownerId });
    const nextSnapshot = await getGroupSnapshot(group.groupId!, ownerId);

    expect(nextSnapshot.week.id).toBe(nextWeek.weekId);
    expect(nextSnapshot.week.status).toBe("VOTING_OPEN");
    expect(nextSnapshot.readingItem).not.toBeNull();
  });
});
