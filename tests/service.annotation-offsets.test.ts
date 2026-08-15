import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetRandomSourceForTests,
  createAnnotation,
  createGroup,
  getAnnotations,
  getGroupSnapshot,
} from "@/lib/service";
import { createTestDb, createUser, type TestDb } from "@/tests/helpers/test-db";

vi.mock("@/lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email")>();
  return { ...actual, sendEmail: vi.fn(async () => ({ success: true })) };
});

describe("annotation offsets", () => {
  let testDb: TestDb;
  beforeEach(async () => {
    testDb = await createTestDb();
    __resetRandomSourceForTests();
  });
  afterEach(async () => {
    __resetRandomSourceForTests();
    await testDb.close();
  });

  it("stores and returns character offsets; legacy annotations return null", async () => {
    const ownerId = await createUser(testDb.pool, { name: "O", email: "oc@x.com" });
    const group = await createGroup({
      name: "GC",
      timezone: "America/New_York",
      ownerId,
      votingDurationHours: 168,
    });
    const snap = await getGroupSnapshot(group.groupId!, ownerId);
    const ri = snap.readingItem!.id;

    await createAnnotation({
      readingItemId: ri,
      userId: ownerId,
      startVerse: 5,
      endVerse: 5,
      text: "partial",
      startOffset: 10,
      endOffset: 24,
    });
    await createAnnotation({
      readingItemId: ri,
      userId: ownerId,
      startVerse: 6,
      endVerse: 6,
      text: "legacy full verse",
    });

    const anns = await getAnnotations(ri, ownerId);
    const partial = anns.find((a) => a.text === "partial")!;
    expect(partial.startOffset).toBe(10);
    expect(partial.endOffset).toBe(24);
    const legacy = anns.find((a) => a.text === "legacy full verse")!;
    expect(legacy.startOffset).toBeNull();
    expect(legacy.endOffset).toBeNull();
  });

  it("rejects inverted offsets", async () => {
    const ownerId = await createUser(testDb.pool, { name: "O2", email: "oc2@x.com" });
    const group = await createGroup({
      name: "GC2",
      timezone: "America/New_York",
      ownerId,
      votingDurationHours: 168,
    });
    const snap = await getGroupSnapshot(group.groupId!, ownerId);
    await expect(
      createAnnotation({
        readingItemId: snap.readingItem!.id,
        userId: ownerId,
        startVerse: 5,
        endVerse: 5,
        text: "bad",
        startOffset: 24,
        endOffset: 10,
      }),
    ).rejects.toThrow(/offset/i);
  });
});
