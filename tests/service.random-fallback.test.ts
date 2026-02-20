import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  __resetRandomSourceForTests,
  __setRandomSourceForTests,
  castVote,
  createGroup,
  getGroupSnapshot,
  resolveCurrentWeek,
} from "@/lib/service";
import { addGroupMember, createTestDb, createUser, type TestDb } from "@/tests/helpers/test-db";

describe("service random fallback", () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createTestDb();
    __resetRandomSourceForTests();
  });

  afterEach(async () => {
    __resetRandomSourceForTests();
    await testDb.close();
  });

  it("uses deterministic random selection when resolving a no-vote week", async () => {
    const ownerId = await createUser(testDb.pool, { name: "Owner", email: "owner-no-votes@example.com" });
    const group = await createGroup({
      name: "No Vote Group",
      timezone: "America/New_York",
      ownerId,
      votingDurationHours: 168,
    });

    const snapshot = await getGroupSnapshot(group.groupId!, ownerId);
    expect(snapshot.proposals.length).toBeGreaterThan(1);

    __setRandomSourceForTests(() => 0.99);
    const resolved = await resolveCurrentWeek(group.groupId!, ownerId);

    expect(resolved.status).toBe("RESOLVED");
    expect(resolved.reference).toBe(snapshot.proposals[snapshot.proposals.length - 1].reference);
  });

  it("uses deterministic random selection for RANDOM tie policy", async () => {
    const ownerId = await createUser(testDb.pool, { name: "Owner", email: "owner-tie@example.com" });
    const memberAId = await createUser(testDb.pool, { name: "Member A", email: "member-a@example.com" });
    const memberBId = await createUser(testDb.pool, { name: "Member B", email: "member-b@example.com" });

    const group = await createGroup({
      name: "Tie Group",
      timezone: "America/New_York",
      ownerId,
      tiePolicy: "RANDOM",
      votingDurationHours: 168,
    });

    await addGroupMember(testDb.pool, { groupId: group.groupId!, userId: memberAId, role: "MEMBER" });
    await addGroupMember(testDb.pool, { groupId: group.groupId!, userId: memberBId, role: "MEMBER" });

    const initial = await getGroupSnapshot(group.groupId!, ownerId);
    expect(initial.proposals.length).toBeGreaterThan(1);

    await castVote({ groupId: group.groupId!, userId: ownerId, proposalId: initial.proposals[0].id });
    await castVote({ groupId: group.groupId!, userId: memberAId, proposalId: initial.proposals[1].id });

    const tiedSnapshot = await getGroupSnapshot(group.groupId!, ownerId);
    const maxVoteCount = Math.max(...tiedSnapshot.proposals.map((proposal) => proposal.voteCount));
    const tied = tiedSnapshot.proposals.filter((proposal) => proposal.voteCount === maxVoteCount);
    expect(tied.length).toBe(2);

    __setRandomSourceForTests(() => 0.99);
    const resolved = await resolveCurrentWeek(group.groupId!, ownerId);

    expect(resolved.status).toBe("RESOLVED");
    expect(resolved.reference).toBe(tied[1].reference);
  });
});
