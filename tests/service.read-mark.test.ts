import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  __resetRandomSourceForTests,
  createGroup,
  getGroupSnapshot,
  getUserReadHistory,
  setReadMark,
} from "@/lib/service";
import { createTestDb, createUser, type TestDb } from "@/tests/helpers/test-db";

describe("read marks score the personal tally", () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createTestDb();
    __resetRandomSourceForTests();
  });

  afterEach(async () => {
    __resetRandomSourceForTests();
    await testDb.close();
  });

  it("counts a READ mark toward passages read and keeps it on that passage", async () => {
    const ownerId = await createUser(testDb.pool, { name: "Owner", email: "read-tally@x.com" });
    const group = await createGroup({
      name: "Readers",
      timezone: "America/New_York",
      ownerId,
      votingDurationHours: 168,
    });

    const snap = await getGroupSnapshot(group.groupId!, ownerId);
    expect(snap.proposals.length).toBeGreaterThan(1);
    const target = snap.proposals[snap.proposals.length - 1];
    expect(target.readingItemId).toBeTruthy();

    const before = await getUserReadHistory(ownerId);
    expect(before.totalRead).toBe(0);

    await setReadMark({
      readingItemId: target.readingItemId!,
      userId: ownerId,
      status: "READ",
    });

    const after = await getUserReadHistory(ownerId);
    expect(after.totalRead).toBe(1);
    expect(after.items.some((item) => item.reference === target.reference)).toBe(true);

    await setReadMark({
      readingItemId: target.readingItemId!,
      userId: ownerId,
      status: "READ",
    });
    const again = await getUserReadHistory(ownerId);
    expect(again.totalRead).toBe(1);

    const marked = await getGroupSnapshot(group.groupId!, ownerId);
    const mine = marked.readMarks.find(
      (m) => m.userId === ownerId && m.readingItemId === target.readingItemId,
    );
    expect(mine?.status).toBe("READ");
    const topId = marked.readingItem?.id;
    if (topId && topId !== target.readingItemId) {
      const onTop = marked.readMarks.find(
        (m) => m.userId === ownerId && m.readingItemId === topId,
      );
      expect(onTop?.status === "READ").toBe(false);
    }
  });
});
