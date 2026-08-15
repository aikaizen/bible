# P0 Voting/Selection Redesign — Parallel Workstream Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the winner-per-week voting model with a passage-list model: every proposal is independently readable/commentable, votes rank passages and protect them from reroll, weeks roll over on a timer and archive cleanly, and the reader highlights only the words you selected.

**Architecture:** Three parallel workstreams after one small serial contract task. Workstream A rebuilds the data model and service layer (backend only, never touches `app/page.tsx`). Workstream B rebuilds the voting tab UI (owns the vote-tab region of `app/page.tsx`). Workstream C adds partial-verse highlighting (owns the reader region of `app/page.tsx` plus the annotations service functions). A shared contract (Task 0) defines every cross-stream type and column up front so no stream blocks another.

**Tech Stack:** Next.js 15 App Router, React 19, raw `pg`, vitest + pg-mem, single-file client (`app/page.tsx`), idempotent DDL in `db/schema.sql`.

**Spec:** `docs/roadmap/todo-v0.2.md` — sections "P0 - Voting / Selection Experience (Primetime)" and the band-aid/data-model notes. Original requirements captured 2026-08-14.

## Global Constraints

- All DDL is idempotent (`IF NOT EXISTS` / guarded `DO $$` blocks) and appended to `db/schema.sql` — this repo has no incremental migration runner; `npm run db:migrate` re-runs the whole file.
- No ORM. Raw SQL via `dbQuery`/`dbQueryOne` from `lib/db.ts`. pg-mem (tests) cannot parse: `OR` across a join filter, `CROSS JOIN`, `IS DISTINCT FROM`. Use `COALESCE($n, '00000000-0000-0000-0000-000000000000'::uuid)` for optional-uuid exclusion.
- Tests: `npm test` (vitest, pg-mem in `tests/helpers/test-db.ts`). **Any new column must ALSO be added to `TEST_SCHEMA_SQL` in `tests/helpers/test-db.ts`** or every test using it fails.
- Build gate: `npm run build` runs ESLint as errors — apostrophes in JSX must be `&apos;`.
- Deacon AI, super admin, and email delivery are PARKED: leave their code paths in place, do not extend them, do not set `FIREWORKS_API_KEY`/`RESEND_API_KEY`.
- Commit style: `feat:`/`fix:` conventional commits, one per task step-group.

## Product Decisions Locked In (assumption flagged)

1. **Clean weekly sweep** (assumption, per P0 #5 "verses in play get switched and this week gets archived"): at rollover ALL of the week's passages archive together — voted user proposals do NOT carry over. Comments/annotations stay attached to their archived reading items (P1 history reads them). If the user later wants voted passages to carry over, only `rolloverGroupWeek` (Task A5) changes.
2. **Vote = toggle, multiple votes allowed** (one per passage per user). A vote's meanings: ranks the list, and blocks reroll on that passage.
3. **Reroll** exists only on seed passages, admin-only (unchanged), but is DISABLED (grayed) the moment the passage has ≥1 vote. There is exactly one reroll control, on the passage card. Any other reroll affordance found in the UI is removed.
4. **Reading tab** shows the last passage the user opened (client-side choice); the snapshot's `readingItem` becomes "top-ranked passage" as a default.
5. **Partial-verse highlights** store character offsets into the verse text. Null offsets = whole verse (all existing annotations remain valid). Comment labels remain verse-level ("Comment on verse 5").

## Coordination Rules (read before starting any task)

- **Branches:** `feat/model-v2` (A), `feat/voting-ui` (B), `feat/reader-offsets` (C), all cut from `main` AFTER Task 0 merges to `main`.
- **File ownership (hard rule):**
  - A: `lib/service.ts`, `app/api/**` (except annotations routes), `tests/**`. NEVER edits `app/page.tsx`.
  - B: `app/page.tsx` vote-tab region (the `{tab === "vote"}` section, `onVote`/`daysLeft`/proposal handlers) + `app/globals.css` additions at end of file.
  - C: `app/page.tsx` reader region (verse rendering, `handleVerseSelection`, bottom sheet, `Annotation` type) + `lib/service.ts` ONLY the functions `createAnnotation`/`getAnnotations` + `app/api/reading-items/[readingItemId]/annotations/route.ts` + `app/globals.css` additions at end of file.
  - The only shared file A↔C is `lib/service.ts` in disjoint functions; B↔C share `app/page.tsx` in disjoint regions. Merge order at integration: A → C → B.
- **Contract types** live in `lib/contract-v2.ts` (created in Task 0). Both B and C import from it; A implements it. Nobody edits it after Task 0 without telling the other streams.

---

# Task 0 (SERIAL — merge to main before anything else): Shared Contract

**Files:**
- Modify: `db/schema.sql` (append at end)
- Modify: `tests/helpers/test-db.ts` (TEST_SCHEMA_SQL users/annotations/votes/proposals/reading_items blocks)
- Create: `lib/contract-v2.ts`

**Interfaces:**
- Produces: every new column, and the `SnapshotV2` additions all three streams rely on.

- [ ] **Step 1: Append idempotent DDL to `db/schema.sql`**

```sql
-- ============================================================
-- P0 voting redesign (2026-08-14): passage-list model
-- ============================================================

-- Proposals: archive support (rollover sweeps passages into history)
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES users(id);

-- Reading items: one per proposal (was one per week)
ALTER TABLE reading_items DROP CONSTRAINT IF EXISTS reading_items_week_id_key;
CREATE INDEX IF NOT EXISTS idx_reading_items_week_id ON reading_items(week_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reading_items_proposal_unique
  ON reading_items(proposal_id) WHERE proposal_id IS NOT NULL;

-- Votes: one vote per user per PASSAGE (was one per user per week)
ALTER TABLE votes DROP CONSTRAINT IF EXISTS votes_week_id_user_id_key;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'votes_proposal_user_unique'
  ) THEN
    ALTER TABLE votes ADD CONSTRAINT votes_proposal_user_unique UNIQUE (proposal_id, user_id);
  END IF;
END
$$;

-- Annotations: optional character offsets for partial-verse highlights.
-- start_offset = char offset into start_verse's text; end_offset = char offset
-- into end_verse's text (exclusive). NULL = whole verse (legacy annotations).
ALTER TABLE annotations ADD COLUMN IF NOT EXISTS start_offset INT;
ALTER TABLE annotations ADD COLUMN IF NOT EXISTS end_offset INT;
```

- [ ] **Step 2: Mirror every column in `tests/helpers/test-db.ts`**

In `TEST_SCHEMA_SQL`: add `archived_at TIMESTAMPTZ` and `archived_by UUID` to the proposals table; add `start_offset INT` and `end_offset INT` to annotations; change votes' `UNIQUE (week_id, user_id)` to `UNIQUE (proposal_id, user_id)`; remove `UNIQUE` from reading_items' `week_id` column (leave it a plain FK column).

- [ ] **Step 3: Create `lib/contract-v2.ts`**

```typescript
// Contract between backend (workstream A) and UI (workstreams B/C).
// Task 0 freezes this file; changes after that require cross-stream signoff.

/** Additions to each element of snapshot.proposals */
export interface PassageV2 {
  id: string;
  reference: string;
  note: string;
  proposerId: string;
  proposerName: string;
  createdAt: string;
  isSeed: boolean;
  voteCount: number;
  voters: Array<{ id: string; name: string }>;
  commentCount: number;
  unreadCount: number;
  /** NEW: this passage's own reading item — every passage is readable */
  readingItemId: string | null;
  /** NEW: true when the current user has voted for this passage */
  myVote: boolean;
  /** NEW: seed + zero votes + caller is admin → reroll enabled */
  canReroll: boolean;
}

/** Additions to snapshot.week */
export interface WeekV2 {
  id: string;
  startDate: string;
  /** Rollover instant — the countdown target. Same value the old
   *  votingCloseAt carried; renamed in meaning, kept in shape. */
  votingCloseAt: string;
  status: "VOTING_OPEN" | "RESOLVED" | "PENDING_MANUAL";
  resolvedReadingId: string | null;
}

/** New top-level snapshot field */
export type MyVoteProposalIds = string[];

/** Annotation shape with offsets (workstream C) */
export interface AnnotationV2 {
  id: string;
  authorId: string;
  authorName: string;
  startVerse: number;
  endVerse: number;
  /** char offset into startVerse text, null = verse start */
  startOffset: number | null;
  /** exclusive char offset into endVerse text, null = verse end */
  endOffset: number | null;
  text: string;
  createdAt: string;
  canDelete: boolean;
}

export const MAX_USER_PROPOSALS_PER_WEEK = 2;
```

- [ ] **Step 4: Verify: `npm test` and `npm run build` both pass**

Run: `npm test && npm run build`
Expected: 13 tests pass (schema additions are backward-compatible), build compiles.

- [ ] **Step 5: Run migration against dev DB and commit**

```bash
npm run db:migrate
git add db/schema.sql tests/helpers/test-db.ts lib/contract-v2.ts
git commit -m "feat: contract v2 — schema and types for passage-list model"
git push origin main
```

---

# WORKSTREAM A — Model & API (branch `feat/model-v2`)

Backend only. Never edits `app/page.tsx`. Each task: red → green → commit.

### Task A1: Per-passage vote toggle

**Files:**
- Modify: `lib/service.ts` (`castVote`, remove `syncReadingToVoteLeader` entirely)
- Create: `tests/service.multi-vote.test.ts`

**Interfaces:**
- Produces: `castVote(params): Promise<{ ok: true; voted: boolean }>` — `voted` is the post-toggle state. Route `POST /api/groups/[groupId]/vote` body `{ proposalId }` unchanged.
- Produces: snapshot gains `myVoteProposalIds: string[]` (kept alongside legacy `myVoteProposalId`, which becomes the first element or null).

- [ ] **Step 1: Write failing tests**

```typescript
// tests/service.multi-vote.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __resetRandomSourceForTests, castVote, createGroup, getGroupSnapshot } from "@/lib/service";
import { addGroupMember, createTestDb, createUser, type TestDb } from "@/tests/helpers/test-db";

describe("per-passage voting", () => {
  let testDb: TestDb;
  beforeEach(async () => { testDb = await createTestDb(); __resetRandomSourceForTests(); });
  afterEach(async () => { __resetRandomSourceForTests(); await testDb.close(); });

  it("lets one user vote on multiple passages and toggle a vote off", async () => {
    const ownerId = await createUser(testDb.pool, { name: "Owner", email: "o@x.com" });
    const group = await createGroup({ name: "G", timezone: "America/New_York", ownerId, votingDurationHours: 168 });
    const snap = await getGroupSnapshot(group.groupId!, ownerId);
    const [p1, p2] = snap.proposals;

    const v1 = await castVote({ groupId: group.groupId!, userId: ownerId, proposalId: p1.id });
    expect(v1.voted).toBe(true);
    const v2 = await castVote({ groupId: group.groupId!, userId: ownerId, proposalId: p2.id });
    expect(v2.voted).toBe(true);

    let after = await getGroupSnapshot(group.groupId!, ownerId);
    expect(after.myVoteProposalIds.sort()).toEqual([p1.id, p2.id].sort());
    expect(after.week.status).toBe("VOTING_OPEN"); // voting never resolves the week

    const v3 = await castVote({ groupId: group.groupId!, userId: ownerId, proposalId: p1.id });
    expect(v3.voted).toBe(false); // toggle off
    after = await getGroupSnapshot(group.groupId!, ownerId);
    expect(after.myVoteProposalIds).toEqual([p2.id]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/service.multi-vote.test.ts` — expect FAIL (`voted` undefined / `myVoteProposalIds` undefined).

- [ ] **Step 3: Implement**

In `castVote`, replace the upsert with a toggle and delete `syncReadingToVoteLeader` (now dead) plus its call-free body comment from the band-aid:

```typescript
export async function castVote(params: { groupId: string; userId: string; proposalId: string }) {
  let week = await getActiveWeek(params.groupId);
  if (!week) week = await ensureCurrentWeek(params.groupId);
  await requireMembership(params.groupId, params.userId);

  if (week.status !== "VOTING_OPEN" || isPast(week.voting_close_at)) {
    throw new ServiceError("Voting is closed", 400);
  }

  const exists = await dbQueryOne<{ id: string }>(
    `SELECT p.id FROM proposals p
     WHERE p.id = $1 AND p.week_id = $2 AND p.deleted_at IS NULL AND p.archived_at IS NULL`,
    [params.proposalId, week.id],
  );
  if (!exists) throw new ServiceError("Proposal not found for current week", 404);

  const existingVote = await dbQueryOne<{ id: string }>(
    `SELECT id FROM votes WHERE proposal_id = $1 AND user_id = $2`,
    [params.proposalId, params.userId],
  );

  if (existingVote) {
    await dbQuery(`DELETE FROM votes WHERE id = $1`, [existingVote.id]);
    return { ok: true as const, voted: false };
  }

  await dbQuery(
    `INSERT INTO votes(week_id, proposal_id, user_id) VALUES ($1, $2, $3)`,
    [week.id, params.proposalId, params.userId],
  );
  return { ok: true as const, voted: true };
}
```

In `getGroupSnapshot`, replace the single `myVote` lookup with:

```typescript
const myVotes = await dbQuery<{ proposal_id: string }>(
  `SELECT v.proposal_id FROM votes v
   JOIN proposals p ON p.id = v.proposal_id
   WHERE v.week_id = $1 AND v.user_id = $2 AND p.deleted_at IS NULL`,
  [week.id, userId],
);
```

and in the return object:

```typescript
myVoteProposalIds: myVotes.map((v) => v.proposal_id),
myVoteProposalId: myVotes[0]?.proposal_id ?? null, // legacy, B removes its last use at integration
```

- [ ] **Step 4: Run full suite** — `npm test` — the lifecycle test's `castVote` assertions on `autoResolved` change to `voted`; update `tests/service.lifecycle.test.ts` lines asserting `autoResolved` to assert `voted === true` instead.

- [ ] **Step 5: Commit** — `git commit -m "feat: per-passage vote toggle, multi-vote snapshot"`

### Task A2: Reading item per proposal

**Files:**
- Modify: `lib/service.ts` (`addProposal`, `insertSeedProposals`, `ensureWeekReadingItem`, `getGroupSnapshot`, `removeProposal`, `rerollSeedProposal`)
- Modify: `tests/service.comment-continuity.test.ts` (extend)

**Interfaces:**
- Consumes: Task 0 unique index `idx_reading_items_proposal_unique`.
- Produces: every non-deleted proposal has exactly one reading item. Snapshot `proposals[]` gains `readingItemId: string | null` (contract `PassageV2.readingItemId`). Snapshot `readingItem` = reading item of the top-voted passage (ties → earliest created).

- [ ] **Step 1: Write failing test** (append to comment-continuity spec)

```typescript
it("gives every proposal its own reading item and never re-anchors comments", async () => {
  const ownerId = await createUser(testDb.pool, { name: "Owner", email: "o2@x.com" });
  const group = await createGroup({ name: "G2", timezone: "America/New_York", ownerId, votingDurationHours: 168 });
  const snap = await getGroupSnapshot(group.groupId!, ownerId);

  expect(snap.proposals.length).toBeGreaterThan(1);
  for (const p of snap.proposals) expect(p.readingItemId).toBeTruthy();
  const ids = snap.proposals.map((p) => p.readingItemId);
  expect(new Set(ids).size).toBe(ids.length); // all distinct

  // comment on passage 1, then vote passage 2 to the top — comment stays put
  const target = snap.proposals[0];
  await createComment({ readingItemId: target.readingItemId!, userId: ownerId, text: "anchored here" });
  await castVote({ groupId: group.groupId!, userId: ownerId, proposalId: snap.proposals[1].id });

  const after = await getGroupSnapshot(group.groupId!, ownerId);
  const stillTarget = after.proposals.find((p) => p.id === target.id);
  expect(stillTarget!.readingItemId).toBe(target.readingItemId);
  const comments = await getComments(target.readingItemId!, ownerId);
  expect(comments.comments[0].text).toBe("anchored here");
});
```

(Import `createComment`, `getComments`, `castVote` at top of the file. Check `getComments` return shape in `lib/service.ts` and adjust the last assertion's path to match — it returns `{ comments: [...] }` with `text` per comment.)

- [ ] **Step 2: Run to verify failure** — expect FAIL (`readingItemId` undefined on proposals).

- [ ] **Step 3: Implement**

Add helper (near `upsertWeekReadingFromProposal`, which you should delete along with `ensureWeekReadingItem`'s random-pick behavior):

```typescript
async function ensureReadingItemForProposal(
  weekId: string,
  proposalId: string,
  reference: string,
  client?: PoolClient,
): Promise<void> {
  await dbQuery(
    `INSERT INTO reading_items(week_id, proposal_id, reference)
     VALUES ($1, $2, $3)
     ON CONFLICT (proposal_id) WHERE proposal_id IS NOT NULL DO NOTHING`,
    [weekId, proposalId, reference],
    client,
  );
}
```

Note: pg-mem may reject the partial-index `ON CONFLICT` clause. If it does, use the plain guarded form instead (test first, insert if absent) — acceptable here because proposal creation is not concurrent-critical:

```typescript
const existing = await dbQueryOne<{ id: string }>(
  `SELECT id FROM reading_items WHERE proposal_id = $1`, [proposalId], client);
if (!existing) {
  await dbQuery(
    `INSERT INTO reading_items(week_id, proposal_id, reference) VALUES ($1, $2, $3)`,
    [weekId, proposalId, reference], client);
}
```

Call it: at the end of `addProposal` (after the INSERT, with the new proposal id); inside `insertSeedProposals` for each seed (change its INSERT to `RETURNING id` and loop); in `ensureWeekReadingItem` — rewrite that function to simply ensure every current proposal has a reading item (loop `getWeekProposals` → `ensureReadingItemForProposal`) and return the top-voted passage's reading item:

```typescript
async function ensureWeekReadingItem(weekId: string, client?: PoolClient): Promise<ReadingItemRow | null> {
  const proposals = await dbQuery<{ id: string; reference: string }>(
    `SELECT p.id, p.reference FROM proposals p
     WHERE p.week_id = $1 AND p.deleted_at IS NULL AND p.archived_at IS NULL`,
    [weekId], client,
  );
  for (const p of proposals) await ensureReadingItemForProposal(weekId, p.id, p.reference, client);

  return dbQueryOne<ReadingItemRow>(
    `SELECT ri.id, ri.proposal_id, ri.reference
     FROM reading_items ri
     JOIN proposals p ON p.id = ri.proposal_id
     LEFT JOIN votes v ON v.proposal_id = p.id
     WHERE ri.week_id = $1 AND p.deleted_at IS NULL AND p.archived_at IS NULL
     GROUP BY ri.id, ri.proposal_id, ri.reference, p.created_at
     ORDER BY COUNT(v.id) DESC, p.created_at ASC
     LIMIT 1`,
    [weekId], client,
  );
}
```

In `getGroupSnapshot`, fetch reading item ids per proposal and add to the mapped output:

```typescript
const proposalReadingItems = await dbQuery<{ proposal_id: string; id: string }>(
  `SELECT proposal_id, id FROM reading_items WHERE week_id = $1 AND proposal_id IS NOT NULL`,
  [week.id],
);
const readingItemByProposal = new Map(proposalReadingItems.map((r) => [r.proposal_id, r.id]));
// in proposals.map(...): readingItemId: readingItemByProposal.get(proposal.id) ?? null,
```

In `removeProposal`: delete the block that re-seeds and re-anchors (`insertSeedProposals`/`ensureWeekReadingItem` calls) — removing a passage just soft-deletes it. In `rerollSeedProposal`: after soft-deleting the old seed and inserting the replacement, call `ensureReadingItemForProposal` for the new seed (read the function; it inserts a replacement seed — capture its id via `RETURNING id`).

- [ ] **Step 4: Run full suite** — `npm test`. The `service.random-fallback` tests exercise `pickRandomProposalForWeek` via resolution — they will still pass until Task A5 removes resolution; if they break here, fix forward only what this task changed.

- [ ] **Step 5: Commit** — `git commit -m "feat: reading item per proposal — passages independently readable"`

### Task A3: Two-proposals-per-user weekly cap

**Files:**
- Modify: `lib/service.ts` (`addProposal`)
- Test: `tests/service.multi-vote.test.ts` (append)

**Interfaces:**
- Consumes: `MAX_USER_PROPOSALS_PER_WEEK` from `lib/contract-v2.ts`.
- Produces: `addProposal` throws `ServiceError("You can propose up to 2 passages per week", 400)` on the 3rd non-seed proposal by the same user in the current week.

- [ ] **Step 1: Failing test**

```typescript
it("caps user proposals at 2 per week", async () => {
  const ownerId = await createUser(testDb.pool, { name: "Owner", email: "o3@x.com" });
  const group = await createGroup({ name: "G3", timezone: "America/New_York", ownerId, votingDurationHours: 168 });
  await addProposal({ groupId: group.groupId!, userId: ownerId, reference: "John 3:1-21" });
  await addProposal({ groupId: group.groupId!, userId: ownerId, reference: "Psalm 23" });
  await expect(
    addProposal({ groupId: group.groupId!, userId: ownerId, reference: "Romans 8:18-39" }),
  ).rejects.toThrow(/up to 2 passages/);
});
```

- [ ] **Step 2: Verify failure**, then **Step 3: Implement** — in `addProposal`, after the membership check:

```typescript
import { MAX_USER_PROPOSALS_PER_WEEK } from "./contract-v2";

const mine = await dbQueryOne<{ count: string }>(
  `SELECT COUNT(*)::text AS count FROM proposals
   WHERE week_id = $1 AND proposer_id = $2 AND is_seed = FALSE
     AND deleted_at IS NULL AND archived_at IS NULL`,
  [week.id, params.userId],
);
if (Number(mine?.count ?? 0) >= MAX_USER_PROPOSALS_PER_WEEK) {
  throw new ServiceError("You can propose up to 2 passages per week", 400);
}
```

- [ ] **Step 4: `npm test` green. Step 5: Commit** — `feat: cap user proposals at 2 per week`

### Task A4: Votes block reroll

**Files:**
- Modify: `lib/service.ts` (`rerollSeedProposal`, `getGroupSnapshot`)
- Test: `tests/service.multi-vote.test.ts` (append)

**Interfaces:**
- Produces: reroll on a voted passage → `ServiceError("This passage has votes and can't be rerolled", 400)`. Snapshot `proposals[].canReroll: boolean` (contract `PassageV2.canReroll`): `isSeed && voteCount === 0 && caller is admin`.

- [ ] **Step 1: Failing test**

```typescript
it("refuses to reroll a passage that has votes", async () => {
  const ownerId = await createUser(testDb.pool, { name: "Owner", email: "o4@x.com" });
  const group = await createGroup({ name: "G4", timezone: "America/New_York", ownerId, votingDurationHours: 168 });
  const snap = await getGroupSnapshot(group.groupId!, ownerId);
  const seed = snap.proposals.find((p) => p.isSeed)!;
  await castVote({ groupId: group.groupId!, userId: ownerId, proposalId: seed.id });
  await expect(
    rerollSeedProposal({ groupId: group.groupId!, userId: ownerId, proposalId: seed.id }),
  ).rejects.toThrow(/has votes/);
  const after = await getGroupSnapshot(group.groupId!, ownerId);
  expect(after.proposals.find((p) => p.id === seed.id)!.canReroll).toBe(false);
});
```

- [ ] **Step 2: Verify failure**, then **Step 3: Implement** — in `rerollSeedProposal` after the is_seed check:

```typescript
const voteRow = await dbQueryOne<{ count: string }>(
  `SELECT COUNT(*)::text AS count FROM votes WHERE proposal_id = $1`,
  [params.proposalId],
);
if (Number(voteRow?.count ?? 0) > 0) {
  throw new ServiceError("This passage has votes and can't be rerolled", 400);
}
```

In `getGroupSnapshot`'s proposal mapping (vote counts already computed):

```typescript
canReroll:
  proposal.is_seed &&
  Number(proposal.vote_count) === 0 &&
  mapRoleWeight(membership.role) >= mapRoleWeight("ADMIN"),
myVote: myVotes.some((v) => v.proposal_id === proposal.id),
```

- [ ] **Step 4: `npm test` green. Step 5: Commit** — `feat: votes protect passages from reroll`

### Task A5: Timer rollover replaces resolution

**Files:**
- Modify: `lib/service.ts` (replace `maybeAutoResolveWeek`; delete `finalizeWeek`, `calculateWinner`, `startNewVote`, `resolveCurrentWeek`, `pickRandomProposalForWeek` and tie-policy helpers; update `runWeeklyRollover`)
- Delete: `app/api/groups/[groupId]/resolve/route.ts`, `app/api/groups/[groupId]/new-vote/route.ts`
- Modify: `tests/service.lifecycle.test.ts`, `tests/service.random-fallback.test.ts`, `tests/service.concurrency.test.ts`

**Interfaces:**
- Produces: `rolloverGroupWeek(groupId): Promise<{ rolledOver: boolean; newWeekId: string | null }>` (internal, called from `ensureCurrentWeek` when `isPast(voting_close_at)` and from the cron route). Old week: `status = 'RESOLVED'` (enum reused to mean "archived"), all its proposals get `archived_at = NOW()`. New week: fresh seeds, each with its own reading item. Snapshot consumers see `week.status === "VOTING_OPEN"` essentially always.
- Removed: `POST /api/groups/[groupId]/resolve` and `/new-vote` (B deletes the buttons calling them).

- [ ] **Step 1: Rewrite lifecycle test** to describe the new lifecycle:

```typescript
it("archives the week at rollover and starts a fresh one with new seeds", async () => {
  const ownerId = await createUser(testDb.pool, { name: "Owner", email: "owner@example.com" });
  const group = await createGroup({ name: "Friends", timezone: "America/New_York", ownerId, votingDurationHours: 168 });
  const first = await getGroupSnapshot(group.groupId!, ownerId);
  expect(first.week.status).toBe("VOTING_OPEN");
  const firstWeekId = first.week.id;
  const firstProposalIds = first.proposals.map((p) => p.id);

  // Force the timer past due, then any snapshot triggers rollover
  await testDb.pool.query(`UPDATE weeks SET voting_close_at = NOW() - interval '1 hour' WHERE id = $1`, [firstWeekId]);
  const next = await getGroupSnapshot(group.groupId!, ownerId);

  expect(next.week.id).not.toBe(firstWeekId);
  expect(next.week.status).toBe("VOTING_OPEN");
  expect(next.proposals.length).toBeGreaterThan(0);
  for (const p of next.proposals) expect(firstProposalIds).not.toContain(p.id);

  const oldWeek = await testDb.pool.query(`SELECT status::text FROM weeks WHERE id = $1`, [firstWeekId]);
  expect(oldWeek.rows[0].status).toBe("RESOLVED");
  const archived = await testDb.pool.query(
    `SELECT COUNT(*)::int AS n FROM proposals WHERE week_id = $1 AND archived_at IS NULL AND deleted_at IS NULL`,
    [firstWeekId],
  );
  expect(archived.rows[0].n).toBe(0);
});
```

Delete the old resolution assertions and the `startNewVote`/`resolveCurrentWeek` imports. In `tests/service.random-fallback.test.ts`: both tests exist to pin winner-selection randomness, which no longer exists — replace the file's tests with one test asserting rollover creates deterministic seeds (or delete the file if seeds are covered elsewhere; check `insertSeedProposals` determinism is still exercised by the lifecycle test above — it is, via `pickGlobalSeedsForDate`). In `tests/service.concurrency.test.ts`: the "manual resolve idempotent" test becomes "rollover idempotent under concurrent snapshots" — call `getGroupSnapshot` twice concurrently after forcing the timer past due and assert exactly one new week exists:

```typescript
it("keeps rollover idempotent under concurrent snapshot calls", async () => {
  const ownerId = await createUser(testDb.pool, { name: "Owner", email: "c@x.com" });
  const group = await createGroup({ name: "C", timezone: "America/New_York", ownerId, votingDurationHours: 168 });
  const snap = await getGroupSnapshot(group.groupId!, ownerId);
  await testDb.pool.query(`UPDATE weeks SET voting_close_at = NOW() - interval '1 hour' WHERE id = $1`, [snap.week.id]);
  await Promise.all([getGroupSnapshot(group.groupId!, ownerId), getGroupSnapshot(group.groupId!, ownerId)]);
  const weeks = await testDb.pool.query(
    `SELECT COUNT(*)::int AS n FROM weeks WHERE group_id = $1 AND status = 'VOTING_OPEN'`, [group.groupId]);
  expect(weeks.rows[0].n).toBe(1);
});
```

- [ ] **Step 2: Run to verify the new tests fail** against current resolution behavior.

- [ ] **Step 3: Implement**

```typescript
async function rolloverGroupWeek(groupId: string): Promise<{ rolledOver: boolean; newWeekId: string | null }> {
  return withTransaction(async (client) => {
    const week = await dbQueryOne<WeekRow>(
      `${WEEK_SELECT} WHERE group_id = $1 AND status != 'RESOLVED'
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [groupId], client,
    );
    if (!week || !isPast(week.voting_close_at)) return { rolledOver: false, newWeekId: null };

    // Archive: freeze the old week exactly as it stood (P1 history reads this)
    await dbQuery(`UPDATE weeks SET status = 'RESOLVED' WHERE id = $1`, [week.id], client);
    await dbQuery(
      `UPDATE proposals SET archived_at = NOW()
       WHERE week_id = $1 AND deleted_at IS NULL AND archived_at IS NULL`,
      [week.id], client,
    );

    const group = await getGroup(groupId, client);
    const meta = await getCurrentWeekMeta(groupId); // reuse existing helper for tz-correct dates
    const newWeek = await dbQueryOne<{ id: string; start_date: string }>(
      `INSERT INTO weeks(group_id, start_date, voting_close_at, status)
       VALUES ($1, CURRENT_DATE, NOW() + (interval '1 hour' * $2::int), 'VOTING_OPEN')
       ON CONFLICT (group_id, start_date) DO NOTHING
       RETURNING id, start_date::text`,
      [groupId, group.voting_duration_hours], client,
    );
    if (!newWeek) {
      // same-day rollover already created this week (concurrent call) — done
      return { rolledOver: false, newWeekId: null };
    }
    await insertSeedProposals(groupId, newWeek.id, group.owner_id, 3, newWeek.start_date);
    await ensureWeekReadingItem(newWeek.id, client);
    await notifyGroupMembers(groupId, "VOTING_OPENED", "A new week of readings is open!",
      { groupId, weekId: newWeek.id }, undefined, client);
    return { rolledOver: true, newWeekId: newWeek.id };
  });
}
```

Check `getGroup`/`getCurrentWeekMeta`/`insertSeedProposals` signatures for a `client` param — thread `client` through where they accept one; where they don't, either add the optional param following the file's existing pattern or call before opening the transaction. `insertSeedProposals` currently uses bare `dbQuery` — add the optional `client` param.

Replace `maybeAutoResolveWeek(week)` inside `ensureCurrentWeek` with:

```typescript
if (isPast(week.voting_close_at)) {
  await rolloverGroupWeek(groupId);
  const fresh = await getActiveWeek(groupId);
  if (fresh) return fresh;
}
```

Update `runWeeklyRollover` (cron) to call `rolloverGroupWeek` per group instead of the resolve/create pair. Delete `finalizeWeek`, `calculateWinner` and its tie helpers, `startNewVote`, `resolveCurrentWeek`, `pickRandomProposalForWeek`, and the two route files. `grep -n "finalizeWeek\|calculateWinner\|startNewVote\|resolveCurrentWeek" lib app tests` must return nothing.

- [ ] **Step 4: `npm test && npm run build` green. Step 5: Commit** — `feat: timer rollover replaces winner resolution`

### Task A6: Passage ordering + week status simplification in snapshot

**Files:**
- Modify: `lib/service.ts` (`getGroupSnapshot` proposals query)
- Test: `tests/service.multi-vote.test.ts` (append)

**Interfaces:**
- Produces: `snapshot.proposals` arrives sorted: `voteCount DESC, createdAt ASC`. (B renders in array order — no client sorting.)

- [ ] **Step 1: Failing test**

```typescript
it("orders passages by votes then age", async () => {
  const ownerId = await createUser(testDb.pool, { name: "Owner", email: "o6@x.com" });
  const memberId = await createUser(testDb.pool, { name: "M", email: "m6@x.com" });
  const group = await createGroup({ name: "G6", timezone: "America/New_York", ownerId, votingDurationHours: 168 });
  await addGroupMember(testDb.pool, { groupId: group.groupId!, userId: memberId, role: "MEMBER" });
  const snap = await getGroupSnapshot(group.groupId!, ownerId);
  const last = snap.proposals[snap.proposals.length - 1];
  await castVote({ groupId: group.groupId!, userId: ownerId, proposalId: last.id });
  await castVote({ groupId: group.groupId!, userId: memberId, proposalId: last.id });
  const after = await getGroupSnapshot(group.groupId!, ownerId);
  expect(after.proposals[0].id).toBe(last.id);
  expect(after.proposals[0].voteCount).toBe(2);
});
```

- [ ] **Step 2: Verify failure**, then **Step 3:** change the proposals query's ORDER BY to `ORDER BY COUNT(v.id) DESC, p.created_at ASC` (find the snapshot's proposals aggregate query; it already LEFT JOINs votes for `vote_count`), and add `AND p.archived_at IS NULL` to its WHERE.

- [ ] **Step 4: `npm test` green. Step 5: Commit** — `feat: server-side passage ranking by votes`

---

# WORKSTREAM B — Voting UI (branch `feat/voting-ui`)

Owns the vote-tab region of `app/page.tsx` + end-of-file `app/globals.css`. Until A merges, the dev server still runs old behavior — build B's UI against the contract types; wire-up gaps are listed per task and close automatically when A lands (same field names).

### Task B1: Countdown replaces resolution UI

**Files:**
- Modify: `app/page.tsx` (vote tab, ~lines 1650–1940; `daysLeft` memo at ~379)
- Modify: `app/globals.css` (append)

**Interfaces:**
- Consumes: `week.votingCloseAt` (existing field, now = rollover instant).

- [ ] **Step 1: Remove the resolved-state card** — delete the entire `{snapshot.week.status === "RESOLVED" && (...)}` block (the "This week's vote is resolved" card and its "Start New Vote" button) and the `onStartNewVote` handler and the "Resolve Now (Admin)" button block with its `onResolve` handler (both call endpoints A5 deletes).

- [ ] **Step 2: Add the rollover countdown** at the bottom of the vote tab where the resolved card was:

```tsx
<div className="card rollover-timer">
  <div className="rollover-timer-label">Next week begins in</div>
  <div className="rollover-timer-value">
    {daysLeft > 0
      ? `${daysLeft} day${daysLeft === 1 ? "" : "s"}`
      : "less than a day"}
  </div>
  <div className="rollover-timer-sub">
    Current passages will be archived to History and fresh readings will arrive.
  </div>
</div>
```

Keep the existing `daysLeft` memo (it already computes days from `votingCloseAt`). Remove the old "Closes {date} · N days left" header line (~1673) — the timer card replaces it.

```css
/* append to globals.css */
.rollover-timer { text-align: center; }
.rollover-timer-label { font-size: 12px; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.08em; }
.rollover-timer-value { font-size: 28px; font-weight: 700; margin: 4px 0; }
.rollover-timer-sub { font-size: 12px; color: var(--text-tertiary); }
```

(Check variable names against globals.css — use whatever `--text-*` tokens the file actually defines; grep `text-tertiary` there first.)

- [ ] **Step 3: Verify** — `npm run dev`, open the group's vote tab: no resolved banner, no Start New Vote, no Resolve Now, countdown card renders. `npm run build` passes.

- [ ] **Step 4: Commit** — `feat(ui): rollover countdown replaces resolution UI`

### Task B2: Multi-vote buttons + reroll graying

**Files:**
- Modify: `app/page.tsx` (proposal card actions ~1717–1772, `onVote` ~942)

**Interfaces:**
- Consumes: `proposals[].myVote`, `proposals[].canReroll`, `myVoteProposalIds` (contract). Until A merges, derive interim values: `const myVote = snapshot.myVoteProposalId === p.id` and `const canReroll = isAdmin && p.isSeed` — mark each with `// TODO(integration): use p.myVote / p.canReroll` so the grep in the integration task finds them.

- [ ] **Step 1: Rework `onVote` optimistic update for toggle semantics**

```tsx
function onVote(proposalId: string) {
  if (!groupId || !selectedUserId) return;
  setSnapshot((prev) => {
    if (!prev) return prev;
    const userName = prev.members.find((m) => m.id === selectedUserId)?.name ?? "";
    return {
      ...prev,
      proposals: prev.proposals.map((p) => {
        if (p.id !== proposalId) return p;
        const hadMyVote = p.voters.some((v) => v.id === selectedUserId);
        return {
          ...p,
          voteCount: p.voteCount + (hadMyVote ? -1 : 1),
          voters: hadMyVote
            ? p.voters.filter((v) => v.id !== selectedUserId)
            : [...p.voters, { id: selectedUserId, name: userName }],
        };
      }),
    };
  });
  void (async () => {
    try {
      setSubmitting(true);
      await api(`/api/groups/${groupId}/vote`, { method: "POST", body: JSON.stringify({ proposalId }) });
      await refreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vote failed");
      await refreshData();
    } finally {
      setSubmitting(false);
    }
  })();
}
```

- [ ] **Step 2: Vote button per card** — voted state derives from voters (works pre- and post-integration):

```tsx
{(() => {
  const iVoted = p.voters.some((v) => v.id === selectedUserId);
  return (
    <button
      className={`btn ${iVoted ? "btn-gold" : ""}`}
      onClick={() => onVote(p.id)}
      disabled={submitting || daysLeft <= 0}
      type="button"
    >
      {iVoted && <IconCheck />}
      {iVoted ? "Voted" : "Vote"}
    </button>
  );
})()}
```

Remove the `snapshot.week.status !== "VOTING_OPEN"` disable condition (weeks are effectively always open now).

- [ ] **Step 3: Reroll graying** — replace the seed reroll button block:

```tsx
{isAdmin && p.isSeed && (
  <button
    className="btn btn-sm"
    onClick={() => onReroll(p.id)}
    disabled={submitting || p.voteCount > 0 /* TODO(integration): use !p.canReroll */}
    title={p.voteCount > 0 ? "Voted passages can't be rerolled" : "Swap this suggestion"}
    type="button"
  >
    Reroll
  </button>
)}
```

Sweep the rest of the vote tab and app header for any other reroll affordance; if one exists anywhere else (the "top right" the requirements mention), delete it — the card button is the only reroll control.

- [ ] **Step 4: Remove client-side references to `myVoteProposalId`** in the vote tab card className (`voted`/`top-voted` classes): `voted` now derives from `p.voters.some(...)`; `top-voted` = `snapshot.proposals[0]?.id === p.id && p.voteCount > 0`.

- [ ] **Step 5: Verify** — `npm run dev`: vote toggles on/off per passage optimistically; reroll grays on a voted seed. `npm run build` green. Commit — `feat(ui): multi-vote toggle, reroll graying, passage ranking display`

### Task B3: Every passage opens its own reading

**Files:**
- Modify: `app/page.tsx` (card "Read" button ~1727; propose-form gating ~1837)

**Interfaces:**
- Consumes: `proposals[].readingItemId` (A2). Interim: keep `openInReader(p.reference)`; add `// TODO(integration): open p.readingItemId so comments attach per-passage`.

- [ ] **Step 1:** Change the card's Read button to route through the passage's own reading item once available — target shape:

```tsx
<button className="btn btn-sm" onClick={() => openPassage(p)} type="button">Read</button>
```

with

```tsx
function openPassage(p: Snapshot["proposals"][number]) {
  // TODO(integration): setActiveReadingItemId(p.readingItemId) once A2 lands
  openInReader(p.reference);
  setTab("reading");
}
```

- [ ] **Step 2:** Propose form: remove the `snapshot.week.status === "VOTING_OPEN" &&` gate (keep `daysLeft > 0`). Show remaining quota when the user has proposals this week:

```tsx
{myProposalCount >= 2 ? (
  <div className="text-tertiary" style={{ fontSize: 12 }}>
    You&apos;ve proposed 2 passages this week — the weekly limit.
  </div>
) : (
  /* existing Propose passage button/form */
)}
```

with `const myProposalCount = snapshot.proposals.filter((p) => !p.isSeed && p.proposerId === selectedUserId).length;` placed with the other derived values near `isAdmin` (~395).

- [ ] **Step 3: Verify + commit** — `feat(ui): per-passage reading entry, proposal quota display`

---

# WORKSTREAM C — Partial-Verse Highlights (branch `feat/reader-offsets`)

Owns reader region of `app/page.tsx`, `createAnnotation`/`getAnnotations` in `lib/service.ts`, annotations route.

### Task C1: Offsets through the API

**Files:**
- Modify: `lib/service.ts` (`createAnnotation`, `getAnnotations` ONLY)
- Modify: `app/api/reading-items/[readingItemId]/annotations/route.ts`
- Create: `tests/service.annotation-offsets.test.ts`

**Interfaces:**
- Produces: `createAnnotation` accepts optional `startOffset`/`endOffset` (non-negative ints, `endOffset > startOffset` required when both set on a single-verse annotation); `getAnnotations` returns `startOffset`/`endOffset` (null for legacy rows) matching contract `AnnotationV2`.

- [ ] **Step 1: Failing test**

```typescript
// tests/service.annotation-offsets.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetRandomSourceForTests, createAnnotation, getAnnotations, createGroup, getGroupSnapshot } from "@/lib/service";
import { createTestDb, createUser, type TestDb } from "@/tests/helpers/test-db";

vi.mock("@/lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email")>();
  return { ...actual, sendEmail: vi.fn(async () => ({ success: true })) };
});

describe("annotation offsets", () => {
  let testDb: TestDb;
  beforeEach(async () => { testDb = await createTestDb(); __resetRandomSourceForTests(); });
  afterEach(async () => { __resetRandomSourceForTests(); await testDb.close(); });

  it("stores and returns character offsets; legacy annotations return null", async () => {
    const ownerId = await createUser(testDb.pool, { name: "O", email: "oc@x.com" });
    const group = await createGroup({ name: "GC", timezone: "America/New_York", ownerId, votingDurationHours: 168 });
    const snap = await getGroupSnapshot(group.groupId!, ownerId);
    const ri = snap.readingItem!.id;

    await createAnnotation({ readingItemId: ri, userId: ownerId, startVerse: 5, endVerse: 5, text: "partial", startOffset: 10, endOffset: 24 });
    await createAnnotation({ readingItemId: ri, userId: ownerId, startVerse: 6, endVerse: 6, text: "legacy full verse" });

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
    const group = await createGroup({ name: "GC2", timezone: "America/New_York", ownerId, votingDurationHours: 168 });
    const snap = await getGroupSnapshot(group.groupId!, ownerId);
    await expect(
      createAnnotation({ readingItemId: snap.readingItem!.id, userId: ownerId, startVerse: 5, endVerse: 5, text: "bad", startOffset: 24, endOffset: 10 }),
    ).rejects.toThrow(/offset/i);
  });
});
```

- [ ] **Step 2: Verify failure**, then **Step 3: Implement**

`createAnnotation` params gain `startOffset?: number | null; endOffset?: number | null`; validation after the verse-range check:

```typescript
const startOffset = params.startOffset ?? null;
const endOffset = params.endOffset ?? null;
if (startOffset !== null && (!Number.isInteger(startOffset) || startOffset < 0)) {
  throw new ServiceError("Invalid start offset", 422);
}
if (endOffset !== null && (!Number.isInteger(endOffset) || endOffset < 0)) {
  throw new ServiceError("Invalid end offset", 422);
}
if (params.startVerse === params.endVerse && startOffset !== null && endOffset !== null && endOffset <= startOffset) {
  throw new ServiceError("End offset must be after start offset", 422);
}
```

INSERT gains the two columns; `getAnnotations`' SELECT gains `a.start_offset, a.end_offset` and the mapper gains `startOffset: a.start_offset, endOffset: a.end_offset`. The route handler passes `body.startOffset`/`body.endOffset` straight through.

- [ ] **Step 4: `npm test` green. Step 5: Commit** — `feat: annotation character offsets in service + API`

### Task C2: Capture selection offsets in the reader

**Files:**
- Modify: `app/page.tsx` (`handleVerseSelection` ~545, `selectedVerses` state ~344, annotation submit ~612, `Annotation` type)

**Interfaces:**
- Consumes: C1's API params. Produces: `selectedVerses` state becomes `{ start: number; end: number; startOffset: number | null; endOffset: number | null }`.

- [ ] **Step 1: Extend `handleVerseSelection`** to compute offsets. After the existing verse-span loop identifies `startVerse`/`endVerse`:

```tsx
// Compute character offsets within the first and last verse's text node.
// Verse spans contain <sup>{n}</sup> then the verse text node(s).
function offsetWithinVerse(span: HTMLSpanElement, node: Node, nodeOffset: number): number {
  let total = 0;
  const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT, {
    acceptNode: (t) =>
      t.parentElement?.closest("sup") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    if (t === node) return total + nodeOffset;
    total += t.textContent?.length ?? 0;
  }
  return total; // selection boundary outside text nodes → clamp to end
}

const startSpan = container.querySelector<HTMLSpanElement>(`[data-verse="${startVerse}"]`);
const endSpan = container.querySelector<HTMLSpanElement>(`[data-verse="${endVerse}"]`);
let startOffset: number | null = null;
let endOffset: number | null = null;
if (startSpan && startSpan.contains(range.startContainer)) {
  startOffset = offsetWithinVerse(startSpan, range.startContainer, range.startOffset);
}
if (endSpan && endSpan.contains(range.endContainer)) {
  endOffset = offsetWithinVerse(endSpan, range.endContainer, range.endOffset);
}
setSelectedVerses({ start: startVerse, end: endVerse, startOffset, endOffset });
```

The trailing `{" "}` space each verse renders is part of the last text node — clamp: if `endOffset` exceeds the verse's trimmed text length, the renderer treats it as verse-end, so no special-casing needed here.

- [ ] **Step 2: Thread offsets through submit** — the annotation POST body gains `startOffset: selectedVerses.startOffset, endOffset: selectedVerses.endOffset`. Update the `Annotation` client type with `startOffset: number | null; endOffset: number | null`. Update every `setSelectedVerses({ start, end })` call site to include `startOffset: null, endOffset: null`.

- [ ] **Step 3: Verify** — `npm run dev`, select part of a verse, submit a comment, then `curl` the annotations endpoint (or log) and confirm offsets persisted. The bottom-sheet label must still read "Comment on verse 5" — verify unchanged (it keys off `selectedVerses.start/end` only).

- [ ] **Step 4: Commit** — `feat(ui): capture sub-verse selection offsets`

### Task C3: Render partial highlights

**Files:**
- Modify: `app/page.tsx` (verse rendering ~1985–2010)
- Modify: `app/globals.css` (append)

**Interfaces:**
- Consumes: `AnnotationV2` offsets from C1; `verseAnnotationMap` (existing memo mapping verse → annotations).

- [ ] **Step 1: Replace the per-verse span body** with a segment renderer. For each verse, compute highlight ranges in char space, then emit alternating plain/highlighted `<span>`s:

```tsx
function verseSegments(text: string, verse: number, anns: Annotation[]) {
  // Map each annotation covering this verse to a [from, to) char range in this verse
  const ranges = anns.map((a) => {
    const from = a.startVerse === verse && a.startOffset != null ? Math.min(a.startOffset, text.length) : 0;
    const to = a.endVerse === verse && a.endOffset != null ? Math.min(a.endOffset, text.length) : text.length;
    return { from: Math.min(from, to), to: Math.max(from, to), ann: a };
  }).filter((r) => r.to > r.from);
  if (ranges.length === 0) return [{ text, ann: null as Annotation | null }];

  const cuts = Array.from(new Set([0, text.length, ...ranges.flatMap((r) => [r.from, r.to])])).sort((a, b) => a - b);
  const segs: Array<{ text: string; ann: Annotation | null }> = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const [from, to] = [cuts[i], cuts[i + 1]];
    const covering = ranges.find((r) => r.from <= from && r.to >= to);
    segs.push({ text: text.slice(from, to), ann: covering?.ann ?? null });
  }
  return segs;
}
```

In the verse map, keep the outer `data-verse` span (selection detection depends on it) and render:

```tsx
<span key={v.verse} data-verse={v.verse} className="bible-verse">
  <sup className="verse-num">{v.verse}</sup>
  {verseSegments(v.text, v.verse, anns ?? []).map((seg, i) =>
    seg.ann ? (
      <span
        key={i}
        className="verse-highlighted"
        style={{ "--hl-color": colorFor(seg.ann.authorId) } as React.CSSProperties}
        onClick={(e) => { e.stopPropagation(); onClickHighlight(seg.ann!); }}
      >
        {seg.text}
      </span>
    ) : (
      <span key={i}>{seg.text}</span>
    ),
  )}{" "}
</span>
```

Keep the existing `verse-selecting` class logic on the outer span (unchanged condition). Legacy annotations (null offsets) produce a single full-verse range — visually identical to today.

- [ ] **Step 2: Check `.verse-highlighted` CSS** — it currently styles whole-verse spans; confirm it works on inline sub-spans (background-color + border-radius is fine; if it uses display/padding tricks, add an inline-friendly override appended to globals.css).

- [ ] **Step 3: Verify in dev** — three cases: (a) legacy full-verse annotation renders as before; (b) new partial annotation highlights only selected words; (c) multi-verse partial annotation: partial first verse, full middle, partial last. Comments list at the bottom still tags "verse N" (unchanged).

- [ ] **Step 4: Run the mobile audit** — invoke the `mobile-audit` skill against the dev server; fix any reader regressions it flags.

- [ ] **Step 5: Commit** — `feat(ui): render partial-verse highlights`

---

# INTEGRATION (SERIAL — one person, after all streams finish)

### Task I1: Merge and reconcile

- [ ] **Step 1:** Merge order into a fresh `integration` branch off `main`: `feat/model-v2`, then `feat/reader-offsets`, then `feat/voting-ui`. Resolve `page.tsx` conflicts region-by-region (B owns vote tab, C owns reader).
- [ ] **Step 2:** Close every `TODO(integration)`: `grep -rn "TODO(integration)" app lib` — switch B's interim derivations to `p.myVote`, `p.canReroll`, `p.readingItemId` (reader opens per-passage reading items: `openPassage` sets the active reading item id and loads its annotations/comments), and remove the legacy `myVoteProposalId` snapshot field and its last client references.
- [ ] **Step 3:** Full gate: `npm test && npm run build`. Manual pass: propose (×2 cap), vote-toggle multiple passages, reroll grayed on voted seed, per-passage Read with per-passage comments, countdown card, partial highlight, force a rollover in dev (`UPDATE weeks SET voting_close_at = NOW() - interval '1 hour'`) and confirm archive + fresh seeds.
- [ ] **Step 4:** Merge `integration` → `main`, push.

### Task I2: Deploy

- [ ] **Step 1:** Run `npm run db:migrate` against the production `DATABASE_URL` (schema is additive + idempotent; this also backfills the columns prod is missing for the already-committed code: `is_superadmin`, `PASSAGE_READ`).
- [ ] **Step 2:** Deploy via `vercel --prod --yes` (or dashboard). Smoke-test at `bible.promptengines.com`: sign in, vote toggle, propose, read, comment, partial highlight.
- [ ] **Step 3:** Tag: `git tag v0.2 && git push --tags`; update `docs/changelog.md` and check off the P0 items in `docs/roadmap/todo-v0.2.md`.

---

## Self-Review Notes

- P0 #1 (any member proposes): already true on `main`; B3 removes the last status-gate on the form. Covered.
- P0 #2 (auto-visible + 2/user cap): visibility pre-existing; cap in A3 + UI in B3. Covered.
- P0 #3 (partial highlight, verse-tagged comments): C1–C3. Covered.
- P0 #4 (remove top-right reroll): B2 Step 3 sweep — only one reroll control survives, on the card. Covered.
- P0 #5 (countdown, archive rollover, no resolved banner): A5 + B1. Covered.
- P0 #6 (vote blocks reroll): A4 + B2. Covered.
- Cross-stream type names verified: `readingItemId`, `myVote`, `canReroll`, `myVoteProposalIds`, `startOffset`/`endOffset`, `MAX_USER_PROPOSALS_PER_WEEK` consistent across A/B/C tasks and `lib/contract-v2.ts`.
