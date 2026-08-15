import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetRandomSourceForTests,
  castVote,
  createGroup,
  getGroupSnapshot,
  rerollSeedProposal,
} from "@/lib/service";
import { createTestDb, createUser, type TestDb } from "@/tests/helpers/test-db";

vi.mock("@/lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email")>();
  return { ...actual, sendEmail: vi.fn(async () => ({ success: true })) };
});

// Shrink the curated catalogue to exactly the 3 passages a week needs, so that
// engaging with all of them exhausts the pool and forces the exhaustion fallback.
vi.mock("@/lib/seed-passages", () => {
  const POOL = [
    { reference: "Psalm 23", note: "The Lord is my shepherd" },
    { reference: "John 1:1-18", note: "In the beginning was the Word" },
    { reference: "Romans 8:1-17", note: "Life in the Spirit" },
  ];
  const pick = (count: number, excluded: string[]) => {
    const ex = new Set(excluded.map((r) => r.toLowerCase().trim()));
    return POOL.filter((p) => !ex.has(p.reference.toLowerCase().trim())).slice(0, count);
  };
  return {
    pickSeedPassages: (count: number, excluded: string[]) => pick(count, excluded),
    pickGlobalSeedsForDate: (_startDate: string, count: number, excluded: string[]) =>
      pick(count, excluded),
  };
});

describe("seed pool lifecycle", () => {
  let testDb: TestDb;

  beforeEach(async () => {
    testDb = await createTestDb();
    __resetRandomSourceForTests();
  });

  afterEach(async () => {
    __resetRandomSourceForTests();
    await testDb.close();
  });

  it("still seeds the next week when the available pool is fully exhausted", async () => {
    const ownerId = await createUser(testDb.pool, { name: "Owner", email: "exhaust@example.com" });
    const group = await createGroup({
      name: "Exhausted Pool",
      timezone: "America/New_York",
      ownerId,
      votingDurationHours: 168,
    });

    const snapshot = await getGroupSnapshot(group.groupId!, ownerId);
    expect(snapshot.proposals.length).toBe(3);

    // Engage with every passage in the pool: each becomes permanently excluded.
    for (const proposal of snapshot.proposals) {
      await castVote({ groupId: group.groupId!, userId: ownerId, proposalId: proposal.id });
    }

    await testDb.pool.query(`UPDATE weeks SET voting_close_at = NOW() - interval '1 hour' WHERE id = $1`, [
      snapshot.week.id,
    ]);

    const next = await getGroupSnapshot(group.groupId!, ownerId);
    expect(next.week.id).not.toBe(snapshot.week.id);
    // Without the exhaustion fallback this would be 0 and every later week would be empty.
    expect(next.proposals.length).toBe(3);
    expect(new Set(next.proposals.map((p) => p.reference)).size).toBe(3);

    // Every new seed got its own reading item. Queried directly rather than through
    // snapshot.readingItemId because pg-mem's auto-created FK index on
    // reading_items.week_id intermittently misses freshly committed rows (pg-mem
    // artifact only — real Postgres is unaffected).
    const items = await testDb.pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM reading_items`,
    );
    expect(Number(items.rows[0].n)).toBe(6);
  });

  it("refuses to reroll a proposal on an archived week and leaves it intact", async () => {
    const ownerId = await createUser(testDb.pool, { name: "Owner", email: "archived@example.com" });
    const group = await createGroup({
      name: "Archived Reroll",
      timezone: "America/New_York",
      ownerId,
      votingDurationHours: 168,
    });

    const snapshot = await getGroupSnapshot(group.groupId!, ownerId);
    const oldSeed = snapshot.proposals.find((p) => p.isSeed)!;

    await testDb.pool.query(`UPDATE weeks SET voting_close_at = NOW() - interval '1 hour' WHERE id = $1`, [
      snapshot.week.id,
    ]);
    const next = await getGroupSnapshot(group.groupId!, ownerId);
    expect(next.week.id).not.toBe(snapshot.week.id);

    await expect(
      rerollSeedProposal({ groupId: group.groupId!, userId: ownerId, proposalId: oldSeed.id }),
    ).rejects.toThrow(/Proposal not found/);

    const row = await testDb.pool.query<{ deleted_at: string | null; archived_at: string | null }>(
      `SELECT deleted_at, archived_at FROM proposals WHERE id = $1`,
      [oldSeed.id],
    );
    expect(row.rows.length).toBe(1);
    expect(row.rows[0].deleted_at).toBeNull();
    expect(row.rows[0].archived_at).not.toBeNull();
  });

  it("errors instead of shrinking the week when no fresh passage is available to swap in", async () => {
    const ownerId = await createUser(testDb.pool, { name: "Owner", email: "noswap@example.com" });
    const group = await createGroup({
      name: "No Swap",
      timezone: "America/New_York",
      ownerId,
      votingDurationHours: 168,
    });

    // All 3 mocked passages are already live on this week, so there is nothing to swap in.
    const snapshot = await getGroupSnapshot(group.groupId!, ownerId);
    const seed = snapshot.proposals.find((p) => p.isSeed)!;

    await expect(
      rerollSeedProposal({ groupId: group.groupId!, userId: ownerId, proposalId: seed.id }),
    ).rejects.toThrow(/No fresh passages available/);

    const after = await getGroupSnapshot(group.groupId!, ownerId);
    expect(after.proposals.length).toBe(snapshot.proposals.length);
    expect(after.proposals.some((p) => p.id === seed.id)).toBe(true);
  });
});
