import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetRandomSourceForTests,
  createAnnotation,
  createAnnotationReply,
  createGroup,
  getGroupSnapshot,
} from "@/lib/service";
import { sendEmail } from "@/lib/email";
import { addGroupMember, createTestDb, createUser, type TestDb } from "@/tests/helpers/test-db";

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(async () => {}),
}));

describe("service annotation email notifications", () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createTestDb();
    __resetRandomSourceForTests();
  });

  afterEach(async () => {
    __resetRandomSourceForTests();
    await testDb.close();
  });

  it("emails other members when a verse comment is created", async () => {
    const ownerId = await createUser(testDb.pool, { name: "Owner", email: "owner-verse@example.com" });
    const commenterId = await createUser(testDb.pool, { name: "Commenter", email: "commenter-verse@example.com" });
    const memberId = await createUser(testDb.pool, { name: "Member", email: "member-verse@example.com" });

    const group = await createGroup({
      name: "Verse Email Group",
      timezone: "America/New_York",
      ownerId,
      votingDurationHours: 168,
    });

    await addGroupMember(testDb.pool, { groupId: group.groupId!, userId: commenterId, role: "MEMBER" });
    await addGroupMember(testDb.pool, { groupId: group.groupId!, userId: memberId, role: "MEMBER" });

    const snapshot = await getGroupSnapshot(group.groupId!, ownerId);
    if (!snapshot.readingItem) {
      throw new Error("Expected reading item");
    }

    const emailSpy = vi.mocked(sendEmail);
    await createAnnotation({
      readingItemId: snapshot.readingItem.id,
      userId: commenterId,
      startVerse: 5,
      endVerse: 6,
      text: "Reflection on these verses",
    });

    expect(emailSpy).toHaveBeenCalledTimes(2);
    const recipients = emailSpy.mock.calls.map(([params]) => params.to).sort();
    expect(recipients).toEqual(["member-verse@example.com", "owner-verse@example.com"]);
    expect(emailSpy.mock.calls[0][0].subject).toContain("New verse comment");
  });

  it("sends a different email when a reply is posted to a verse thread others already replied in", async () => {
    const ownerId = await createUser(testDb.pool, { name: "Owner", email: "owner-reply@example.com" });
    const firstReplierId = await createUser(testDb.pool, { name: "First", email: "first-reply@example.com" });
    const secondReplierId = await createUser(testDb.pool, { name: "Second", email: "second-reply@example.com" });

    const group = await createGroup({
      name: "Verse Reply Group",
      timezone: "America/New_York",
      ownerId,
      votingDurationHours: 168,
    });

    await addGroupMember(testDb.pool, { groupId: group.groupId!, userId: firstReplierId, role: "MEMBER" });
    await addGroupMember(testDb.pool, { groupId: group.groupId!, userId: secondReplierId, role: "MEMBER" });

    const snapshot = await getGroupSnapshot(group.groupId!, ownerId);
    if (!snapshot.readingItem) {
      throw new Error("Expected reading item");
    }

    const annotation = await createAnnotation({
      readingItemId: snapshot.readingItem.id,
      userId: ownerId,
      startVerse: 9,
      endVerse: 9,
      text: "Initial comment",
    });
    if (!annotation.annotationId) {
      throw new Error("Expected annotation id");
    }

    const emailSpy = vi.mocked(sendEmail);
    emailSpy.mockClear();

    await createAnnotationReply({
      annotationId: annotation.annotationId,
      userId: firstReplierId,
      text: "First reply",
    });
    expect(emailSpy).toHaveBeenCalledTimes(0);

    await createAnnotationReply({
      annotationId: annotation.annotationId,
      userId: secondReplierId,
      text: "Second reply",
    });

    expect(emailSpy).toHaveBeenCalledTimes(1);
    expect(emailSpy.mock.calls[0][0].to).toBe("first-reply@example.com");
    expect(emailSpy.mock.calls[0][0].subject).toContain("Reply in a verse thread");
  });
});
