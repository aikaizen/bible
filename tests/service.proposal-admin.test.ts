import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetRandomSourceForTests,
  addProposal,
  createComment,
  createGroup,
  getGroupSnapshot,
  removeProposal,
} from "@/lib/service";
import { addGroupMember, createTestDb, createUser, type TestDb } from "@/tests/helpers/test-db";

vi.mock("@/lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email")>();
  return { ...actual, sendEmail: vi.fn(async () => ({ success: true })) };
});

describe("admin remove and combined comment counts", () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createTestDb();
    __resetRandomSourceForTests();
  });

  afterEach(async () => {
    __resetRandomSourceForTests();
    await testDb.close();
  });

  it("lets only a group admin remove a passage", async () => {
    const ownerId = await createUser(testDb.pool, { name: "Owner", email: "adm@x.com" });
    const memberId = await createUser(testDb.pool, { name: "Member", email: "mem@x.com" });
    const group = await createGroup({
      name: "G",
      timezone: "America/New_York",
      ownerId,
      votingDurationHours: 168,
    });
    await addGroupMember(testDb.pool, { groupId: group.groupId!, userId: memberId, role: "MEMBER" });
    const added = await addProposal({
      groupId: group.groupId!,
      userId: memberId,
      reference: "John 3:1-21",
    });
    expect(added.proposalId).toBeTruthy();

    await expect(
      removeProposal({ groupId: group.groupId!, userId: memberId, proposalId: added.proposalId! }),
    ).rejects.toThrow(/admin/i);

    await removeProposal({ groupId: group.groupId!, userId: ownerId, proposalId: added.proposalId! });
    const after = await getGroupSnapshot(group.groupId!, ownerId);
    expect(after.proposals.some((p) => p.id === added.proposalId)).toBe(false);
  });

  it("counts surface comments and in-passage discussion together", async () => {
    const ownerId = await createUser(testDb.pool, { name: "Owner", email: "cnt@x.com" });
    const group = await createGroup({
      name: "G",
      timezone: "America/New_York",
      ownerId,
      votingDurationHours: 168,
    });
    const snap = await getGroupSnapshot(group.groupId!, ownerId);
    const target = snap.proposals[0];
    expect(target.readingItemId).toBeTruthy();
    const before = target.commentCount;

    await createComment({
      readingItemId: target.readingItemId!,
      userId: ownerId,
      text: "In the passage",
    });

    const after = await getGroupSnapshot(group.groupId!, ownerId);
    const updated = after.proposals.find((p) => p.id === target.id);
    expect(updated?.commentCount).toBe(before + 1);
  });
});
