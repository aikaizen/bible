import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetRandomSourceForTests,
  addProposal,
  createGroup,
  getGroupSnapshot,
  setReadMark,
} from "@/lib/service";
import { addGroupMember, createTestDb, createUser, type TestDb } from "@/tests/helpers/test-db";

vi.mock("@/lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email")>();
  return {
    ...actual,
    sendEmail: vi.fn(async () => ({ success: true })),
  };
});

const DAY_MS = 24 * 60 * 60 * 1000;

describe("week cadence", () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createTestDb();
    __resetRandomSourceForTests();
  });

  afterEach(async () => {
    __resetRandomSourceForTests();
    await testDb.close();
  });

  it("anchors the new week to the calendar week, not voting_duration_hours", async () => {
    const ownerId = await createUser(testDb.pool, { name: "Owner", email: "cadence@example.com" });

    // 68h is the production default; under the old rollover this made the new
    // week close 2.8 days out.
    const group = await createGroup({
      name: "Cadence",
      timezone: "America/New_York",
      ownerId,
      votingDurationHours: 68,
    });

    const first = await getGroupSnapshot(group.groupId!, ownerId);
    const firstWeekId = first.week.id;

    // Freshly created week: close is already in the future and a full week out.
    const created = await testDb.pool.query<{ close_at: string }>(
      `SELECT voting_close_at::text AS close_at FROM weeks WHERE id = $1`,
      [firstWeekId],
    );
    const createdCloseMs = new Date(created.rows[0].close_at).getTime();
    expect(createdCloseMs).toBeGreaterThan(Date.now());
    expect(createdCloseMs - Date.now()).toBeGreaterThan(6 * DAY_MS);

    // Force the week past due right on a boundary-ish instant and roll over.
    await testDb.pool.query(
      `UPDATE weeks SET voting_close_at = NOW() - interval '1 second' WHERE id = $1`,
      [firstWeekId],
    );
    const next = await getGroupSnapshot(group.groupId!, ownerId);
    expect(next.week.id).not.toBe(firstWeekId);

    const rolled = await testDb.pool.query<{ close_at: string }>(
      `SELECT voting_close_at::text AS close_at FROM weeks WHERE id = $1`,
      [next.week.id],
    );
    const rolledCloseMs = new Date(rolled.rows[0].close_at).getTime();
    // Strictly in the future — a rollover firing on the boundary must never
    // reproduce the boundary it just crossed.
    expect(rolledCloseMs).toBeGreaterThan(Date.now());
    // ~a week out, and in particular far beyond 68 hours (2.83 days).
    expect(rolledCloseMs - Date.now()).toBeGreaterThan(6 * DAY_MS);
    expect(rolledCloseMs - Date.now()).toBeLessThanOrEqual(8 * DAY_MS);
  });

  it("still suggests a passage that only exists in another group's archived week", async () => {
    const readerId = await createUser(testDb.pool, { name: "Reader", email: "reader@example.com" });
    const friendId = await createUser(testDb.pool, { name: "Friend", email: "friend@example.com" });

    const source = await createGroup({
      name: "Source",
      timezone: "America/New_York",
      ownerId: readerId,
      votingDurationHours: 168,
    });
    const target = await createGroup({
      name: "Target",
      timezone: "America/New_York",
      ownerId: friendId,
      votingDurationHours: 168,
    });
    await addGroupMember(testDb.pool, { groupId: target.groupId!, userId: readerId, role: "MEMBER" });

    const reference = "Jude 1:17-25";

    // Target group proposed the passage once, then the week rolled over so both
    // the proposal and its reading item are archived history.
    await addProposal({ groupId: target.groupId!, userId: friendId, reference });
    const targetBefore = await getGroupSnapshot(target.groupId!, friendId);
    await testDb.pool.query(
      `UPDATE weeks SET voting_close_at = NOW() - interval '1 hour' WHERE id = $1`,
      [targetBefore.week.id],
    );
    const targetAfter = await getGroupSnapshot(target.groupId!, friendId);
    expect(targetAfter.week.id).not.toBe(targetBefore.week.id);
    expect(targetAfter.proposals.some((p) => p.reference === reference)).toBe(false);

    // The archived reading item still exists — the old suppression check keyed
    // off exactly this row and killed the suggestion forever.
    const archivedItems = await testDb.pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM reading_items ri
       JOIN weeks w ON w.id = ri.week_id
       WHERE w.group_id = $1 AND ri.reference = $2`,
      [target.groupId!, reference],
    );
    expect(archivedItems.rows[0].n).toBeGreaterThan(0);

    // Reader reads the same passage in the source group. (The reading item id is
    // read straight from the DB: pg-mem mis-evaluates the snapshot's
    // `week_id = $1 AND proposal_id IS NOT NULL` lookup once several groups
    // exist, which is a harness artifact, not product behaviour.)
    await addProposal({ groupId: source.groupId!, userId: readerId, reference });
    const sourceItem = await testDb.pool.query<{ id: string }>(
      `SELECT ri.id FROM reading_items ri
       JOIN weeks w ON w.id = ri.week_id
       WHERE w.group_id = $1 AND ri.reference = $2`,
      [source.groupId!, reference],
    );
    const readingItemId = sourceItem.rows[0]?.id;
    expect(readingItemId).toBeTruthy();

    await setReadMark({ readingItemId, userId: readerId, status: "READ" });

    // setReadMark fires notifyGroupsOnRead as a detached promise.
    const findSuggestion = async () => {
      const rows = await testDb.pool.query<{ text: string; metadata: unknown }>(
        `SELECT text, metadata FROM notifications
         WHERE user_id = $1 AND type = 'PASSAGE_READ'`,
        [friendId],
      );
      return rows.rows.find((r) => {
        const meta = (typeof r.metadata === "string" ? JSON.parse(r.metadata) : r.metadata) as {
          type?: string;
          groupId?: string;
          reference?: string;
        };
        return (
          meta.type === "suggest" && meta.groupId === target.groupId && meta.reference === reference
        );
      });
    };

    let suggest = await findSuggestion();
    for (let i = 0; i < 50 && !suggest; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      suggest = await findSuggestion();
    }
    expect(suggest).toBeTruthy();
    expect(suggest!.text).toContain(reference);
  });
});
