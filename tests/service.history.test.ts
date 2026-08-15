import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  __resetRandomSourceForTests,
  createComment,
  createGroup,
  getArchivedWeek,
  getComments,
  getGroupHistory,
  getGroupSnapshot,
} from "@/lib/service";
import { createTestDb, createUser, type TestDb } from "@/tests/helpers/test-db";

describe("week history and archived discussion", () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createTestDb();
    __resetRandomSourceForTests();
  });

  afterEach(async () => {
    __resetRandomSourceForTests();
    await testDb.close();
  });

  it("lists every archived passage and lets discussion continue after rollover", async () => {
    const ownerId = await createUser(testDb.pool, { name: "Owner", email: "hist@x.com" });
    const group = await createGroup({
      name: "History",
      timezone: "America/New_York",
      ownerId,
      votingDurationHours: 168,
    });

    const live = await getGroupSnapshot(group.groupId!, ownerId);
    expect(live.proposals.length).toBeGreaterThan(1);
    const first = live.proposals[0];
    const second = live.proposals[1];
    expect(first.readingItemId).toBeTruthy();
    expect(second.readingItemId).toBeTruthy();

    await createComment({
      readingItemId: first.readingItemId!,
      userId: ownerId,
      text: "Note on the first passage",
    });
    await createComment({
      readingItemId: second.readingItemId!,
      userId: ownerId,
      text: "Note on the second passage",
    });

    await testDb.pool.query(
      `UPDATE weeks SET voting_close_at = NOW() - interval '1 hour' WHERE id = $1`,
      [live.week.id],
    );
    const next = await getGroupSnapshot(group.groupId!, ownerId);
    expect(next.week.id).not.toBe(live.week.id);

    const emptyLiveHistory = await getGroupHistory(group.groupId!, ownerId);
    const archived = emptyLiveHistory.find((w) => w.weekId === live.week.id);
    expect(archived).toBeTruthy();
    expect(archived!.passages.length).toBeGreaterThanOrEqual(2);
    const archivedFirst = archived!.passages.find((p) => p.readingItemId === first.readingItemId);
    const archivedSecond = archived!.passages.find((p) => p.readingItemId === second.readingItemId);
    expect(archivedFirst?.commentsCount).toBe(1);
    expect(archivedSecond?.commentsCount).toBe(1);

    const weekView = await getArchivedWeek(group.groupId!, live.week.id, ownerId);
    expect(weekView.week.id).toBe(live.week.id);
    expect(weekView.passages.map((p) => p.id).sort()).toEqual(live.proposals.map((p) => p.id).sort());

    await createComment({
      readingItemId: first.readingItemId!,
      userId: ownerId,
      text: "Follow-up after the week archived",
    });
    const comments = await getComments(first.readingItemId!, ownerId);
    expect(comments.some((c) => c.text.includes("Follow-up"))).toBe(true);
    expect(comments.some((c) => c.text.includes("first passage"))).toBe(true);

    await expect(getArchivedWeek(group.groupId!, next.week.id, ownerId)).rejects.toThrow(
      /still in progress/,
    );
  });
});
