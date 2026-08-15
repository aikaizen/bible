import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  __resetRandomSourceForTests,
  addProposal,
  castVote,
  createComment,
  createGroup,
  getComments,
  getGroupSnapshot,
  rerollSeedProposal,
} from "@/lib/service";
import { addGroupMember, createTestDb, createUser, type TestDb } from "@/tests/helpers/test-db";

describe("per-passage voting", () => {
  let testDb: TestDb;
  beforeEach(async () => {
    testDb = await createTestDb();
    __resetRandomSourceForTests();
  });
  afterEach(async () => {
    __resetRandomSourceForTests();
    await testDb.close();
  });

  it("lets one user vote on multiple passages and toggle a vote off", async () => {
    const ownerId = await createUser(testDb.pool, { name: "Owner", email: "o@x.com" });
    const group = await createGroup({
      name: "G",
      timezone: "America/New_York",
      ownerId,
      votingDurationHours: 168,
    });
    const snap = await getGroupSnapshot(group.groupId!, ownerId);
    const [p1, p2] = snap.proposals;

    const v1 = await castVote({ groupId: group.groupId!, userId: ownerId, proposalId: p1.id });
    expect(v1.voted).toBe(true);
    const v2 = await castVote({ groupId: group.groupId!, userId: ownerId, proposalId: p2.id });
    expect(v2.voted).toBe(true);

    let after = await getGroupSnapshot(group.groupId!, ownerId);
    expect(after.myVoteProposalIds.sort()).toEqual([p1.id, p2.id].sort());
    expect(after.week.status).toBe("VOTING_OPEN");

    const v3 = await castVote({ groupId: group.groupId!, userId: ownerId, proposalId: p1.id });
    expect(v3.voted).toBe(false);
    after = await getGroupSnapshot(group.groupId!, ownerId);
    expect(after.myVoteProposalIds).toEqual([p2.id]);
  });

  it("caps user proposals at 2 per week", async () => {
    const ownerId = await createUser(testDb.pool, { name: "Owner", email: "o3@x.com" });
    const group = await createGroup({
      name: "G3",
      timezone: "America/New_York",
      ownerId,
      votingDurationHours: 168,
    });
    await addProposal({ groupId: group.groupId!, userId: ownerId, reference: "John 3:1-21" });
    await addProposal({ groupId: group.groupId!, userId: ownerId, reference: "Psalm 23" });
    await expect(
      addProposal({ groupId: group.groupId!, userId: ownerId, reference: "Romans 8:18-39" }),
    ).rejects.toThrow(/up to 2 passages/);
  });

  it("refuses to reroll a passage that has votes", async () => {
    const ownerId = await createUser(testDb.pool, { name: "Owner", email: "o4@x.com" });
    const group = await createGroup({
      name: "G4",
      timezone: "America/New_York",
      ownerId,
      votingDurationHours: 168,
    });
    const snap = await getGroupSnapshot(group.groupId!, ownerId);
    const seed = snap.proposals.find((p) => p.isSeed)!;
    await castVote({ groupId: group.groupId!, userId: ownerId, proposalId: seed.id });
    await expect(
      rerollSeedProposal({ groupId: group.groupId!, userId: ownerId, proposalId: seed.id }),
    ).rejects.toThrow(/has votes/);
    const after = await getGroupSnapshot(group.groupId!, ownerId);
    expect(after.proposals.find((p) => p.id === seed.id)!.canReroll).toBe(false);
  });

  it("orders passages by votes then age", async () => {
    const ownerId = await createUser(testDb.pool, { name: "Owner", email: "o6@x.com" });
    const memberId = await createUser(testDb.pool, { name: "M", email: "m6@x.com" });
    const group = await createGroup({
      name: "G6",
      timezone: "America/New_York",
      ownerId,
      votingDurationHours: 168,
    });
    await addGroupMember(testDb.pool, { groupId: group.groupId!, userId: memberId, role: "MEMBER" });
    const snap = await getGroupSnapshot(group.groupId!, ownerId);
    const last = snap.proposals[snap.proposals.length - 1];
    await castVote({ groupId: group.groupId!, userId: ownerId, proposalId: last.id });
    await castVote({ groupId: group.groupId!, userId: memberId, proposalId: last.id });
    const after = await getGroupSnapshot(group.groupId!, ownerId);
    expect(after.proposals[0].id).toBe(last.id);
    expect(after.proposals[0].voteCount).toBe(2);
  });
});

describe("reading item per proposal", () => {
  let testDb: TestDb;
  beforeEach(async () => {
    testDb = await createTestDb();
    __resetRandomSourceForTests();
  });
  afterEach(async () => {
    __resetRandomSourceForTests();
    await testDb.close();
  });

  it("gives every proposal its own reading item and never re-anchors comments", async () => {
    const ownerId = await createUser(testDb.pool, { name: "Owner", email: "o2@x.com" });
    const group = await createGroup({
      name: "G2",
      timezone: "America/New_York",
      ownerId,
      votingDurationHours: 168,
    });
    const snap = await getGroupSnapshot(group.groupId!, ownerId);

    expect(snap.proposals.length).toBeGreaterThan(1);
    for (const p of snap.proposals) expect(p.readingItemId).toBeTruthy();
    const ids = snap.proposals.map((p) => p.readingItemId);
    expect(new Set(ids).size).toBe(ids.length);

    const target = snap.proposals[0];
    await createComment({ readingItemId: target.readingItemId!, userId: ownerId, text: "anchored here" });
    await castVote({ groupId: group.groupId!, userId: ownerId, proposalId: snap.proposals[1].id });

    const after = await getGroupSnapshot(group.groupId!, ownerId);
    const stillTarget = after.proposals.find((p) => p.id === target.id);
    expect(stillTarget!.readingItemId).toBe(target.readingItemId);
    const comments = await getComments(target.readingItemId!, ownerId);
    expect(comments[0].text).toBe("anchored here");
  });
});
