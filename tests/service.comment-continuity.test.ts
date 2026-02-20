import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  __resetRandomSourceForTests,
  createComment,
  createGroup,
  getComments,
  getGroupSnapshot,
  resolveCurrentWeek,
  startNewVote,
} from "@/lib/service";
import { addGroupMember, createTestDb, createUser, type TestDb } from "@/tests/helpers/test-db";

describe("service comment continuity", () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createTestDb();
    __resetRandomSourceForTests();
  });

  afterEach(async () => {
    __resetRandomSourceForTests();
    await testDb.close();
  });

  it("keeps old discussion threads available after resolving and opening a new vote round", async () => {
    const ownerId = await createUser(testDb.pool, { name: "Owner", email: "owner-comments@example.com" });
    const memberId = await createUser(testDb.pool, { name: "Member", email: "member-comments@example.com" });

    const group = await createGroup({
      name: "Comments Group",
      timezone: "America/New_York",
      ownerId,
      votingDurationHours: 168,
    });

    await addGroupMember(testDb.pool, { groupId: group.groupId!, userId: memberId, role: "MEMBER" });

    const initial = await getGroupSnapshot(group.groupId!, ownerId);
    const firstReading = initial.readingItem;
    if (!firstReading) {
      throw new Error("Expected initial reading item");
    }

    await createComment({
      readingItemId: firstReading.id,
      userId: memberId,
      text: "First reflection",
    });

    await resolveCurrentWeek(group.groupId!, ownerId, initial.proposals[0].id);
    await startNewVote({ groupId: group.groupId!, userId: ownerId });

    const next = await getGroupSnapshot(group.groupId!, ownerId);
    const nextReading = next.readingItem;
    if (!nextReading) {
      throw new Error("Expected next reading item");
    }
    expect(nextReading.id).not.toBe(firstReading.id);

    await createComment({
      readingItemId: firstReading.id,
      userId: ownerId,
      text: "Follow-up after new vote started",
    });

    const oldComments = await getComments(firstReading.id, ownerId);
    const newComments = await getComments(nextReading.id, ownerId);

    expect(oldComments.length).toBe(2);
    expect(oldComments[0].text).toContain("Follow-up");
    expect(oldComments[1].text).toContain("First reflection");
    expect(Array.isArray(newComments)).toBe(true);
  });
});
