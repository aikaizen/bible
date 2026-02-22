import crypto from "node:crypto";
import { PoolClient } from "pg";

import { dbQuery, dbQueryOne, withTransaction } from "./db";
import { isValidReference, normalizeReference } from "./reference";
import { pickGlobalSeedsForDate, pickSeedPassages } from "./seed-passages";

export type ReadStatus = "NOT_MARKED" | "PLANNED" | "READ";
export type TiePolicy = "ADMIN_PICK" | "RANDOM" | "EARLIEST";
export type GroupRole = "OWNER" | "ADMIN" | "MEMBER";

type WeekStatus = "VOTING_OPEN" | "RESOLVED" | "PENDING_MANUAL";

export class ServiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

type GroupRow = {
  id: string;
  name: string;
  timezone: string;
  owner_id: string;
  tie_policy: TiePolicy;
  live_tally: boolean;
  voting_duration_hours: number;
};

type WeekRow = {
  id: string;
  group_id: string;
  start_date: string;
  voting_close_at: string;
  resolved_reading_id: string | null;
  status: WeekStatus;
  reminder_sent_at: string | null;
};

type ProposalVoteRow = {
  id: string;
  reference: string;
  note: string;
  proposer_id: string;
  proposer_name: string;
  created_at: string;
  vote_count: string;
  is_seed: boolean;
};

type WeekProposalRow = {
  id: string;
  reference: string;
  created_at: string;
};

type ReadingItemRow = {
  id: string;
  proposal_id: string | null;
  reference: string;
};

let randomSource: () => number = () => Math.random();

function nowIso(): string {
  return new Date().toISOString();
}

function mapRoleWeight(role: GroupRole): number {
  if (role === "OWNER") return 3;
  if (role === "ADMIN") return 2;
  return 1;
}

async function getGroup(groupId: string, client?: PoolClient): Promise<GroupRow> {
  const group = await dbQueryOne<GroupRow>(
    `SELECT id, name, timezone, owner_id, tie_policy, live_tally, voting_duration_hours
     FROM groups
     WHERE id = $1`,
    [groupId],
    client,
  );

  if (!group) {
    throw new ServiceError("Group not found", 404);
  }

  return group;
}

async function getMembership(
  groupId: string,
  userId: string,
  client?: PoolClient,
): Promise<{ user_id: string; role: GroupRole } | null> {
  return dbQueryOne<{ user_id: string; role: GroupRole }>(
    `SELECT user_id, role
     FROM group_members
     WHERE group_id = $1 AND user_id = $2`,
    [groupId, userId],
    client,
  );
}

async function requireMembership(
  groupId: string,
  userId: string,
  client?: PoolClient,
): Promise<{ user_id: string; role: GroupRole }> {
  const member = await getMembership(groupId, userId, client);
  if (!member) {
    throw new ServiceError("You are not a member of this group", 403);
  }
  return member;
}

async function requireAdmin(groupId: string, userId: string, client?: PoolClient): Promise<void> {
  const member = await requireMembership(groupId, userId, client);
  if (mapRoleWeight(member.role) < mapRoleWeight("ADMIN")) {
    throw new ServiceError("Admin access required", 403);
  }
}

async function notifyGroupMembers(
  groupId: string,
  type: "VOTING_OPENED" | "VOTING_REMINDER" | "WINNER_SELECTED" | "COMMENT_REPLY" | "MENTION",
  text: string,
  metadata: Record<string, unknown>,
  actorUserId?: string,
  client?: PoolClient,
): Promise<void> {
  await dbQuery(
    `INSERT INTO notifications(user_id, type, text, metadata)
     SELECT gm.user_id, $2::notification_type, $3, $4::jsonb
     FROM group_members gm
     WHERE gm.group_id = $1
       AND ($5::uuid IS NULL OR gm.user_id <> $5::uuid)`,
    [groupId, type, text, JSON.stringify(metadata), actorUserId ?? null],
    client,
  );
}

async function notifyUsers(
  userIds: string[],
  type: "VOTING_OPENED" | "VOTING_REMINDER" | "WINNER_SELECTED" | "COMMENT_REPLY" | "MENTION",
  text: string,
  metadata: Record<string, unknown>,
  client?: PoolClient,
): Promise<void> {
  if (userIds.length === 0) return;

  await dbQuery(
    `INSERT INTO notifications(user_id, type, text, metadata)
     SELECT UNNEST($1::uuid[]), $2::notification_type, $3, $4::jsonb`,
    [userIds, type, text, JSON.stringify(metadata)],
    client,
  );
}

async function getCurrentWeekMeta(groupId: string): Promise<{ startDate: string; closeAt: string }> {
  const row = await dbQueryOne<{ start_date: string; close_at: string }>(
    `SELECT
       date_trunc('week', now() AT TIME ZONE g.timezone)::date::text AS start_date,
       ((date_trunc('week', now() AT TIME ZONE g.timezone) + interval '1 hour' * g.voting_duration_hours) AT TIME ZONE g.timezone)::text AS close_at
     FROM groups g
     WHERE g.id = $1`,
    [groupId],
  );

  if (!row) {
    throw new ServiceError("Group not found", 404);
  }

  return { startDate: row.start_date, closeAt: row.close_at };
}

function pickRandom<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  const raw = randomSource();
  const normalized = Number.isFinite(raw) ? Math.min(0.999999, Math.max(0, raw)) : 0;
  return items[Math.floor(normalized * items.length)] ?? null;
}

export function __setRandomSourceForTests(source: () => number): void {
  randomSource = source;
}

export function __resetRandomSourceForTests(): void {
  randomSource = () => Math.random();
}

async function getWeekProposals(
  weekId: string,
  client?: PoolClient,
): Promise<WeekProposalRow[]> {
  return dbQuery<WeekProposalRow>(
    `SELECT id, reference, created_at::text
     FROM proposals
     WHERE week_id = $1
       AND deleted_at IS NULL
     ORDER BY created_at ASC`,
    [weekId],
    client,
  );
}

async function pickRandomProposalForWeek(
  weekId: string,
  client?: PoolClient,
): Promise<WeekProposalRow | null> {
  const proposals = await getWeekProposals(weekId, client);
  return pickRandom(proposals);
}

async function upsertWeekReadingFromProposal(
  weekId: string,
  proposal: Pick<WeekProposalRow, "id" | "reference">,
  client?: PoolClient,
): Promise<ReadingItemRow | null> {
  return dbQueryOne<ReadingItemRow>(
    `INSERT INTO reading_items(week_id, proposal_id, reference)
     VALUES ($1, $2, $3)
     ON CONFLICT (week_id)
     DO UPDATE SET proposal_id = EXCLUDED.proposal_id, reference = EXCLUDED.reference
     RETURNING id, proposal_id, reference`,
    [weekId, proposal.id, proposal.reference],
    client,
  );
}

async function ensureWeekReadingItem(
  weekId: string,
  client?: PoolClient,
): Promise<ReadingItemRow | null> {
  const [proposals, existingReading] = await Promise.all([
    getWeekProposals(weekId, client),
    dbQueryOne<ReadingItemRow>(
      `SELECT id, proposal_id, reference
       FROM reading_items
       WHERE week_id = $1`,
      [weekId],
      client,
    ),
  ]);

  if (proposals.length === 0) return existingReading;

  if (
    existingReading?.proposal_id &&
    proposals.some((proposal) => proposal.id === existingReading.proposal_id)
  ) {
    return existingReading;
  }

  const randomProposal = pickRandom(proposals);
  if (!randomProposal) return existingReading;

  return upsertWeekReadingFromProposal(weekId, randomProposal, client);
}

async function syncReadingToVoteLeader(weekId: string): Promise<void> {
  const tallies = await dbQuery<{
    id: string;
    reference: string;
    vote_count: string;
    created_at: string;
  }>(
    `SELECT
       p.id,
       p.reference,
       COUNT(v.id)::text AS vote_count,
       p.created_at::text
     FROM proposals p
     LEFT JOIN votes v ON v.proposal_id = p.id
     WHERE p.week_id = $1
       AND p.deleted_at IS NULL
     GROUP BY p.id, p.reference, p.created_at
     ORDER BY COUNT(v.id) DESC, p.created_at ASC`,
    [weekId],
  );

  if (tallies.length === 0) return;

  const topVotes = Number(tallies[0].vote_count);
  if (topVotes <= 0) return;

  const tied = tallies.filter((row) => Number(row.vote_count) === topVotes);
  if (tied.length !== 1) return;

  await upsertWeekReadingFromProposal(weekId, tied[0]);
}

async function insertSeedProposals(
  groupId: string,
  weekId: string,
  ownerId: string,
  count = 3,
  startDate?: string,
): Promise<void> {
  // Get all references read across ALL groups (global history for seed sync)
  const pastReferences = await dbQuery<{ reference: string }>(
    `SELECT DISTINCT ri.reference FROM reading_items ri`,
  );

  const alreadyRead = pastReferences.map((r) => r.reference);

  // Use deterministic selection when startDate is provided (syncs seeds across groups)
  const seeds = startDate
    ? pickGlobalSeedsForDate(startDate, count, alreadyRead)
    : pickSeedPassages(count, alreadyRead);

  for (const seed of seeds) {
    await dbQuery(
      `INSERT INTO proposals(week_id, proposer_id, reference, note, is_seed)
       VALUES ($1, $2, $3, $4, TRUE)`,
      [weekId, ownerId, seed.reference, seed.note],
    );
  }
}

const WEEK_SELECT = `SELECT id, group_id, start_date, voting_close_at::text, resolved_reading_id, status, reminder_sent_at::text FROM weeks`;

async function getActiveWeek(groupId: string): Promise<WeekRow | null> {
  return dbQueryOne<WeekRow>(
    `${WEEK_SELECT} WHERE group_id = $1 AND status != 'RESOLVED' ORDER BY created_at DESC LIMIT 1`,
    [groupId],
  );
}

async function ensureCurrentWeekExists(groupId: string): Promise<WeekRow> {
  // Return any existing active (non-resolved) week
  const active = await getActiveWeek(groupId);
  if (active) return active;

  // No active week — create one for the current calendar week
  const group = await getGroup(groupId);
  const meta = await getCurrentWeekMeta(groupId);

  const inserted = await dbQueryOne<{ id: string }>(
    `INSERT INTO weeks(group_id, start_date, voting_close_at, status)
     SELECT $1, $2::date, $3::timestamptz, 'VOTING_OPEN'
     WHERE NOT EXISTS (
       SELECT 1 FROM weeks WHERE group_id = $1 AND status != 'RESOLVED'
     )
     RETURNING id`,
    [groupId, meta.startDate, meta.closeAt],
  );

  if (inserted) {
    await insertSeedProposals(groupId, inserted.id, group.owner_id, 3, meta.startDate);
    await ensureWeekReadingItem(inserted.id);

    await notifyGroupMembers(
      groupId,
      "VOTING_OPENED",
      "Voting is open for this week's reading.",
      { groupId, weekId: inserted.id, startDate: meta.startDate, closeAt: meta.closeAt },
      undefined,
    );

    const week = await dbQueryOne<WeekRow>(
      `${WEEK_SELECT} WHERE id = $1`,
      [inserted.id],
    );
    if (!week) throw new ServiceError("Unable to create or load current week", 500);
    return week;
  }

  // Race condition: another request created the week between our check and insert
  const fallback = await getActiveWeek(groupId);
  if (fallback) return fallback;

  // All weeks resolved and we couldn't create — return latest
  const latest = await dbQueryOne<WeekRow>(
    `${WEEK_SELECT} WHERE group_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [groupId],
  );
  if (!latest) throw new ServiceError("Unable to create or load current week", 500);
  return latest;
}

function isPast(iso: string): boolean {
  return new Date(iso).getTime() <= Date.now();
}

function isWithinNext24Hours(iso: string): boolean {
  const target = new Date(iso).getTime();
  const now = Date.now();
  return target > now && target - now <= 24 * 60 * 60 * 1000;
}

async function maybeSendVotingReminder(week: WeekRow): Promise<void> {
  if (week.reminder_sent_at) return;
  if (!isWithinNext24Hours(week.voting_close_at)) return;

  await dbQuery(`UPDATE weeks SET reminder_sent_at = NOW() WHERE id = $1 AND reminder_sent_at IS NULL`, [week.id]);

  await notifyGroupMembers(
    week.group_id,
    "VOTING_REMINDER",
    "24h reminder: cast your vote before voting closes.",
    { groupId: week.group_id, weekId: week.id, closeAt: week.voting_close_at },
  );
}

async function calculateWinner(
  weekId: string,
  tiePolicy: TiePolicy,
): Promise<{ proposalId: string | null; status: WeekStatus; reason?: string }> {
  const proposals = await dbQuery<ProposalVoteRow>(
    `SELECT
       p.id,
       p.reference,
       p.note,
       p.proposer_id,
       u.name AS proposer_name,
       p.created_at::text,
       COUNT(v.id)::text AS vote_count
     FROM proposals p
     JOIN users u ON u.id = p.proposer_id
     LEFT JOIN votes v ON v.proposal_id = p.id
     WHERE p.week_id = $1
       AND p.deleted_at IS NULL
     GROUP BY p.id, p.reference, p.note, p.proposer_id, p.created_at, u.name
     ORDER BY COUNT(v.id) DESC, p.created_at ASC`,
    [weekId],
  );

  if (proposals.length === 0) {
    return { proposalId: null, status: "PENDING_MANUAL", reason: "NO_PROPOSALS" };
  }

  const topVotes = Number(proposals[0].vote_count);
  if (topVotes <= 0) {
    const randomProposal = pickRandom(proposals);
    return randomProposal
      ? { proposalId: randomProposal.id, status: "RESOLVED", reason: "NO_VOTES_RANDOM" }
      : { proposalId: null, status: "PENDING_MANUAL", reason: "NO_VOTES" };
  }

  const tied = proposals.filter((proposal) => Number(proposal.vote_count) === topVotes);
  if (tied.length === 1) {
    return { proposalId: tied[0].id, status: "RESOLVED" };
  }

  if (tiePolicy === "ADMIN_PICK") {
    return { proposalId: null, status: "PENDING_MANUAL", reason: "TIE_ADMIN_PICK" };
  }

  if (tiePolicy === "RANDOM") {
    const pick = pickRandom(tied);
    if (!pick) {
      return { proposalId: null, status: "PENDING_MANUAL", reason: "TIE_RANDOM_EMPTY" };
    }
    return { proposalId: pick.id, status: "RESOLVED", reason: "TIE_RANDOM" };
  }

  return { proposalId: tied[0].id, status: "RESOLVED", reason: "TIE_EARLIEST" };
}

async function finalizeWeek(
  weekId: string,
  proposalId: string,
  actorUserId?: string,
): Promise<{ weekStatus: WeekStatus; readingItemId: string | null; reference: string | null }> {
  return withTransaction(async (client) => {
    const week = await dbQueryOne<WeekRow>(
      `SELECT id, group_id, start_date, voting_close_at::text, resolved_reading_id, status, reminder_sent_at::text
       FROM weeks
       WHERE id = $1
       FOR UPDATE`,
      [weekId],
      client,
    );

    if (!week) {
      throw new ServiceError("Week not found", 404);
    }

    if (week.resolved_reading_id) {
      const existing = await dbQueryOne<{ id: string; reference: string }>(
        `SELECT id, reference
         FROM reading_items
         WHERE id = $1`,
        [week.resolved_reading_id],
        client,
      );

      return {
        weekStatus: "RESOLVED",
        readingItemId: existing?.id ?? week.resolved_reading_id,
        reference: existing?.reference ?? null,
      };
    }

    const proposal = await dbQueryOne<{ id: string; reference: string }>(
      `SELECT id, reference
       FROM proposals
       WHERE id = $1 AND week_id = $2 AND deleted_at IS NULL`,
      [proposalId, week.id],
      client,
    );

    if (!proposal) {
      throw new ServiceError("Proposal is not eligible for this week", 400);
    }

    const reading = await dbQueryOne<{ id: string; reference: string }>(
      `INSERT INTO reading_items(week_id, proposal_id, reference)
       VALUES ($1, $2, $3)
       ON CONFLICT (week_id)
       DO UPDATE SET proposal_id = EXCLUDED.proposal_id, reference = EXCLUDED.reference
       RETURNING id, reference`,
      [week.id, proposal.id, proposal.reference],
      client,
    );

    await dbQuery(
      `UPDATE weeks
       SET resolved_reading_id = $1,
           status = 'RESOLVED'
       WHERE id = $2`,
      [reading?.id, week.id],
      client,
    );

    await notifyGroupMembers(
      week.group_id,
      "WINNER_SELECTED",
      `This week's reading is ${proposal.reference}.`,
      { groupId: week.group_id, weekId: week.id, readingItemId: reading?.id, reference: proposal.reference },
      actorUserId,
      client,
    );

    return {
      weekStatus: "RESOLVED",
      readingItemId: reading?.id ?? null,
      reference: reading?.reference ?? null,
    };
  });
}

async function maybeAutoResolveWeek(week: WeekRow): Promise<void> {
  if (week.status === "RESOLVED") return;
  if (!isPast(week.voting_close_at)) return;

  const group = await getGroup(week.group_id);
  const winner = await calculateWinner(week.id, group.tie_policy);

  if (!winner.proposalId || winner.status === "PENDING_MANUAL") {
    const randomProposal = await pickRandomProposalForWeek(week.id);
    if (randomProposal) {
      await finalizeWeek(week.id, randomProposal.id);
      return;
    }

    await dbQuery(`UPDATE weeks SET status = 'PENDING_MANUAL' WHERE id = $1`, [week.id]);
    return;
  }

  await finalizeWeek(week.id, winner.proposalId);
}

async function ensureCurrentWeek(groupId: string): Promise<WeekRow> {
  const week = await ensureCurrentWeekExists(groupId);
  await ensureWeekReadingItem(week.id);
  await maybeSendVotingReminder(week);
  await maybeAutoResolveWeek(week);
  await ensureWeekReadingItem(week.id);

  const refreshedWeek = await dbQueryOne<WeekRow>(
    `SELECT id, group_id, start_date, voting_close_at::text, resolved_reading_id, status, reminder_sent_at::text
     FROM weeks
     WHERE id = $1`,
    [week.id],
  );

  if (!refreshedWeek) {
    throw new ServiceError("Week could not be refreshed", 500);
  }

  return refreshedWeek;
}

export async function resolveCurrentWeek(
  groupId: string,
  userId: string,
  manualProposalId?: string,
): Promise<{ status: WeekStatus; readingItemId: string | null; reference: string | null }> {
  await requireAdmin(groupId, userId);
  const week = await ensureCurrentWeek(groupId);

  if (week.resolved_reading_id) {
    const reading = await dbQueryOne<{ id: string; reference: string }>(
      `SELECT id, reference FROM reading_items WHERE id = $1`,
      [week.resolved_reading_id],
    );

    return { status: "RESOLVED", readingItemId: reading?.id ?? null, reference: reading?.reference ?? null };
  }

  if (manualProposalId) {
    const result = await finalizeWeek(week.id, manualProposalId, userId);
    return { status: result.weekStatus, readingItemId: result.readingItemId, reference: result.reference };
  }

  const group = await getGroup(groupId);
  const winner = await calculateWinner(week.id, group.tie_policy);

  if (!winner.proposalId || winner.status === "PENDING_MANUAL") {
    const randomProposal = await pickRandomProposalForWeek(week.id);
    if (randomProposal) {
      const randomResult = await finalizeWeek(week.id, randomProposal.id, userId);
      return {
        status: randomResult.weekStatus,
        readingItemId: randomResult.readingItemId,
        reference: randomResult.reference,
      };
    }

    await dbQuery(`UPDATE weeks SET status = 'PENDING_MANUAL' WHERE id = $1`, [week.id]);
    return { status: "PENDING_MANUAL", readingItemId: null, reference: null };
  }

  const result = await finalizeWeek(week.id, winner.proposalId, userId);
  return { status: result.weekStatus, readingItemId: result.readingItemId, reference: result.reference };
}

export async function getGroupSnapshot(groupId: string, userId: string) {
  const week = await ensureCurrentWeek(groupId);
  const [membership, group] = await Promise.all([
    requireMembership(groupId, userId),
    getGroup(groupId),
  ]);

  const [members, proposals, votes, myVote, readingItem, history, invite, pendingInvites, proposalCommentCounts] = await Promise.all([
    dbQuery<{
      id: string;
      name: string;
      default_language: string;
      role: GroupRole;
    }>(
      `SELECT u.id, u.name, u.default_language, gm.role
       FROM group_members gm
       JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = $1
       ORDER BY u.name ASC`,
      [groupId],
    ),
    dbQuery<ProposalVoteRow>(
      `SELECT
         p.id,
         p.reference,
         p.note,
         p.proposer_id,
         u.name AS proposer_name,
         p.created_at::text,
         COUNT(v.id)::text AS vote_count,
         p.is_seed
       FROM proposals p
       JOIN users u ON u.id = p.proposer_id
       LEFT JOIN votes v ON v.proposal_id = p.id
       WHERE p.week_id = $1
         AND p.deleted_at IS NULL
       GROUP BY p.id, p.reference, p.note, p.proposer_id, p.created_at, p.is_seed, u.name
       ORDER BY COUNT(v.id) DESC, p.created_at ASC`,
      [week.id],
    ),
    dbQuery<{
      proposal_id: string;
      user_id: string;
      user_name: string;
    }>(
      `SELECT v.proposal_id, v.user_id, u.name AS user_name
       FROM votes v
       JOIN users u ON u.id = v.user_id
       WHERE v.week_id = $1`,
      [week.id],
    ),
    dbQueryOne<{ proposal_id: string }>(
      `SELECT proposal_id
       FROM votes
       WHERE week_id = $1 AND user_id = $2`,
      [week.id, userId],
    ),
    dbQueryOne<{
      id: string;
      reference: string;
      proposal_id: string | null;
      note: string | null;
      proposer_name: string | null;
    }>(
      `SELECT
         ri.id,
         ri.reference,
         ri.proposal_id,
         p.note,
         u.name AS proposer_name
       FROM reading_items ri
       LEFT JOIN proposals p ON p.id = ri.proposal_id
       LEFT JOIN users u ON u.id = p.proposer_id
       WHERE ri.week_id = $1`,
      [week.id],
    ),
    dbQuery<{
      week_id: string;
      start_date: string;
      reference: string;
      comments_count: string;
      read_count: string;
    }>(
      `SELECT
         w.id AS week_id,
         w.start_date,
         ri.reference,
         COUNT(DISTINCT c.id)::text AS comments_count,
         COUNT(DISTINCT CASE WHEN rm.status = 'READ' THEN rm.user_id END)::text AS read_count
       FROM weeks w
       JOIN reading_items ri ON ri.id = w.resolved_reading_id
       LEFT JOIN comments c ON c.reading_item_id = ri.id AND c.deleted_at IS NULL
       LEFT JOIN read_marks rm ON rm.reading_item_id = ri.id
       WHERE w.group_id = $1
         AND w.id <> $2
         AND w.resolved_reading_id IS NOT NULL
       GROUP BY w.id, w.start_date, ri.reference
       ORDER BY w.start_date DESC
       LIMIT 8`,
      [groupId, week.id],
    ),
    dbQueryOne<{ token: string }>(
      `SELECT token
       FROM invites
       WHERE group_id = $1
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC
       LIMIT 1`,
      [groupId],
    ),
    dbQuery<{
      id: string;
      token: string;
      recipient_name: string;
      recipient_contact: string | null;
      created_by: string;
      creator_name: string;
      created_at: string;
    }>(
      `SELECT i.id, i.token, i.recipient_name, i.recipient_contact,
              i.created_by, u.name AS creator_name, i.created_at::text
       FROM invites i
       JOIN users u ON u.id = i.created_by
       WHERE i.group_id = $1
         AND i.status = 'pending'
         AND i.recipient_name IS NOT NULL
         AND (i.expires_at IS NULL OR i.expires_at > NOW())
       ORDER BY i.created_at DESC`,
      [groupId],
    ),
    // Proposal comment counts
    dbQuery<{ proposal_id: string; comment_count: string }>(
      `SELECT pc.proposal_id, COUNT(*)::text AS comment_count
       FROM proposal_comments pc
       JOIN proposals p ON p.id = pc.proposal_id
       WHERE p.week_id = $1 AND pc.deleted_at IS NULL
       GROUP BY pc.proposal_id`,
      [week.id],
    ),
  ]);

  // Build maps for comment counts and unread counts
  const commentCountMap = new Map(proposalCommentCounts.map((r) => [r.proposal_id, Number(r.comment_count)]));
  // Compute unread counts per proposal
  const unreadCountsRaw = commentCountMap.size > 0
    ? await dbQuery<{ proposal_id: string; unread_count: string }>(
        `SELECT pc.proposal_id, COUNT(*)::text AS unread_count
         FROM proposal_comments pc
         JOIN proposals p ON p.id = pc.proposal_id
         WHERE p.week_id = $1
           AND pc.deleted_at IS NULL
           AND (
             NOT EXISTS (
               SELECT 1 FROM proposal_comment_reads pcr
               WHERE pcr.user_id = $2 AND pcr.proposal_id = pc.proposal_id
             )
             OR pc.created_at > (
               SELECT pcr.last_read_at FROM proposal_comment_reads pcr
               WHERE pcr.user_id = $2 AND pcr.proposal_id = pc.proposal_id
             )
           )
         GROUP BY pc.proposal_id`,
        [week.id, userId],
      )
    : [];
  const unreadCountMap = new Map(unreadCountsRaw.map((r) => [r.proposal_id, Number(r.unread_count)]));

  const readMarks = readingItem
    ? await dbQuery<{ user_id: string; status: ReadStatus }>(
        `SELECT user_id, status
         FROM read_marks
         WHERE reading_item_id = $1`,
        [readingItem.id],
      )
    : [];

  return {
    group: {
      id: group.id,
      name: group.name,
      timezone: group.timezone,
      tiePolicy: group.tie_policy,
      liveTally: group.live_tally,
      votingDurationHours: group.voting_duration_hours,
      inviteToken: invite?.token ?? null,
    },
    week: {
      id: week.id,
      startDate: week.start_date,
      votingCloseAt: week.voting_close_at,
      status: week.status,
      resolvedReadingId: week.resolved_reading_id,
    },
    members: members.map((member) => ({
      id: member.id,
      name: member.name,
      language: member.default_language,
      role: member.role,
    })),
    proposals: proposals.map((proposal) => ({
      id: proposal.id,
      reference: proposal.reference,
      note: proposal.note,
      proposerId: proposal.proposer_id,
      proposerName: proposal.proposer_name,
      createdAt: proposal.created_at,
      voteCount: Number(proposal.vote_count),
      isSeed: proposal.is_seed,
      voters: votes
        .filter((vote) => vote.proposal_id === proposal.id)
        .map((vote) => ({ id: vote.user_id, name: vote.user_name })),
      commentCount: commentCountMap.get(proposal.id) ?? 0,
      unreadCount: unreadCountMap.get(proposal.id) ?? 0,
    })),
    myRole: membership.role,
    myVoteProposalId: myVote?.proposal_id ?? null,
    readingItem: readingItem
      ? {
          id: readingItem.id,
          reference: readingItem.reference,
          proposalId: readingItem.proposal_id,
          note: readingItem.note,
          proposerName: readingItem.proposer_name,
        }
      : null,
    readMarks: readMarks.map((mark) => ({ userId: mark.user_id, status: mark.status })),
    history: history.map((item) => ({
      weekId: item.week_id,
      startDate: item.start_date,
      reference: item.reference,
      commentsCount: Number(item.comments_count),
      readCount: Number(item.read_count),
    })),
    pendingInvites: pendingInvites.map((inv) => ({
      id: inv.id,
      token: inv.token,
      recipientName: inv.recipient_name,
      recipientContact: inv.recipient_contact,
      createdBy: inv.created_by,
      creatorName: inv.creator_name,
      createdAt: inv.created_at,
    })),
  };
}

export async function addProposal(params: {
  groupId: string;
  userId: string;
  reference: string;
  note?: string;
}) {
  let week = await getActiveWeek(params.groupId);
  if (!week) week = await ensureCurrentWeek(params.groupId);
  await requireMembership(params.groupId, params.userId);

  if (week.status !== "VOTING_OPEN" || isPast(week.voting_close_at)) {
    throw new ServiceError("Voting is closed for this week", 400);
  }

  const reference = normalizeReference(params.reference);
  if (!isValidReference(reference)) {
    throw new ServiceError("Invalid reference format (ex: John 3:1-21)", 422);
  }

  const note = (params.note ?? "").trim().slice(0, 240);

  const proposal = await dbQueryOne<{ id: string }>(
    `INSERT INTO proposals(week_id, proposer_id, reference, note)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [week.id, params.userId, reference, note],
  );

  return { proposalId: proposal?.id ?? null };
}

export async function removeProposal(params: { groupId: string; userId: string; proposalId: string }) {
  const member = await requireMembership(params.groupId, params.userId);

  const proposal = await dbQueryOne<{ proposer_id: string; week_id: string; week_status: WeekStatus }>(
    `SELECT p.proposer_id, p.week_id, w.status AS week_status
     FROM proposals p
     JOIN weeks w ON w.id = p.week_id
     WHERE p.id = $1
       AND w.group_id = $2
       AND p.deleted_at IS NULL`,
    [params.proposalId, params.groupId],
  );

  if (!proposal) {
    throw new ServiceError("Proposal not found", 404);
  }

  const isAdmin = mapRoleWeight(member.role) >= mapRoleWeight("ADMIN");
  const isOwner = proposal.proposer_id === params.userId;
  if (!isAdmin && !isOwner) {
    throw new ServiceError("Only admins or the proposer can remove this proposal", 403);
  }

  await dbQuery(`UPDATE proposals SET deleted_at = NOW() WHERE id = $1`, [params.proposalId]);

  if (proposal.week_status !== "RESOLVED") {
    const remaining = await dbQueryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM proposals
       WHERE week_id = $1
         AND deleted_at IS NULL`,
      [proposal.week_id],
    );

    if (Number(remaining?.count ?? 0) === 0) {
      const group = await getGroup(params.groupId);
      await insertSeedProposals(params.groupId, proposal.week_id, group.owner_id, 1);
    }

    await ensureWeekReadingItem(proposal.week_id);
  }

  return { ok: true };
}

export async function castVote(params: { groupId: string; userId: string; proposalId: string }) {
  // Fast path: try to get active week without full ensureCurrentWeek
  let week = await getActiveWeek(params.groupId);
  if (!week) week = await ensureCurrentWeek(params.groupId);
  await requireMembership(params.groupId, params.userId);

  if (week.status !== "VOTING_OPEN" || isPast(week.voting_close_at)) {
    throw new ServiceError("Voting is closed", 400);
  }

  const exists = await dbQueryOne<{ id: string }>(
    `SELECT p.id FROM proposals p
     WHERE p.id = $1 AND p.week_id = $2 AND p.deleted_at IS NULL`,
    [params.proposalId, week.id],
  );

  if (!exists) {
    throw new ServiceError("Proposal not found for current week", 404);
  }

  await dbQuery(
    `INSERT INTO votes(week_id, proposal_id, user_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (week_id, user_id)
     DO UPDATE SET proposal_id = EXCLUDED.proposal_id, created_at = NOW()`,
    [week.id, params.proposalId, params.userId],
  );

  await syncReadingToVoteLeader(week.id);

  // Auto-resolve: check if all members have voted
  const [voteResult, memberResult] = await Promise.all([
    dbQueryOne<{ count: string }>(`SELECT COUNT(*)::text AS count FROM votes WHERE week_id = $1`, [week.id]),
    dbQueryOne<{ count: string }>(`SELECT COUNT(*)::text AS count FROM group_members WHERE group_id = $1`, [params.groupId]),
  ]);
  const voteCount = Number(voteResult?.count ?? 0);
  const memberCount = Number(memberResult?.count ?? 0);

  if (voteCount >= memberCount && memberCount > 0) {
    const group = await getGroup(params.groupId);
    const winner = await calculateWinner(week.id, group.tie_policy);
    if (winner.proposalId && winner.status !== "PENDING_MANUAL") {
      await finalizeWeek(week.id, winner.proposalId);
      return { ok: true, autoResolved: true };
    }
  }

  return { ok: true, autoResolved: false };
}

export async function setReadMark(params: {
  readingItemId: string;
  userId: string;
  status: ReadStatus;
}) {
  if (!["NOT_MARKED", "PLANNED", "READ"].includes(params.status)) {
    throw new ServiceError("Invalid read mark status", 422);
  }

  const access = await dbQueryOne<{ group_id: string }>(
    `SELECT w.group_id
     FROM reading_items ri
     JOIN weeks w ON w.id = ri.week_id
     JOIN group_members gm ON gm.group_id = w.group_id
     WHERE ri.id = $1
       AND gm.user_id = $2`,
    [params.readingItemId, params.userId],
  );

  if (!access) {
    throw new ServiceError("Reading item not found or access denied", 404);
  }

  await dbQuery(
    `INSERT INTO read_marks(user_id, reading_item_id, status)
     VALUES ($1, $2, $3::read_status)
     ON CONFLICT (user_id, reading_item_id)
     DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()`,
    [params.userId, params.readingItemId, params.status],
  );

  return { ok: true };
}

function extractMentionHandles(text: string): string[] {
  const matches = text.match(/@([a-zA-Z0-9_]+)/g) ?? [];
  return Array.from(new Set(matches.map((token) => token.slice(1).toLowerCase())));
}

export async function getComments(readingItemId: string, userId: string) {
  const access = await dbQueryOne<{ group_id: string }>(
    `SELECT w.group_id
     FROM reading_items ri
     JOIN weeks w ON w.id = ri.week_id
     JOIN group_members gm ON gm.group_id = w.group_id
     WHERE ri.id = $1
       AND gm.user_id = $2`,
    [readingItemId, userId],
  );

  if (!access) {
    throw new ServiceError("Reading item not found or access denied", 404);
  }

  const comments = await dbQuery<{
    id: string;
    parent_id: string | null;
    author_id: string;
    author_name: string;
    text: string;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT c.id, c.parent_id, c.author_id, u.name AS author_name, c.text, c.created_at::text, c.updated_at::text
     FROM comments c
     JOIN users u ON u.id = c.author_id
     WHERE c.reading_item_id = $1
       AND c.deleted_at IS NULL
     ORDER BY c.created_at ASC`,
    [readingItemId],
  );

  const topLevel = comments
    .filter((comment) => comment.parent_id === null)
    .map((comment) => ({
      id: comment.id,
      authorId: comment.author_id,
      authorName: comment.author_name,
      text: comment.text,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
      canEdit: comment.author_id === userId && Date.now() - new Date(comment.created_at).getTime() <= 5 * 60 * 1000,
      canDelete: comment.author_id === userId,
      replies: comments
        .filter((reply) => reply.parent_id === comment.id)
        .map((reply) => ({
          id: reply.id,
          authorId: reply.author_id,
          authorName: reply.author_name,
          text: reply.text,
          createdAt: reply.created_at,
          updatedAt: reply.updated_at,
          canEdit: reply.author_id === userId && Date.now() - new Date(reply.created_at).getTime() <= 5 * 60 * 1000,
          canDelete: reply.author_id === userId,
        })),
    }));

  return topLevel.reverse();
}

export async function createComment(params: {
  readingItemId: string;
  userId: string;
  text: string;
  parentId?: string;
}) {
  const text = params.text.trim();
  if (!text) {
    throw new ServiceError("Comment cannot be empty", 422);
  }
  if (text.length > 500) {
    throw new ServiceError("Comment exceeds 500 characters", 422);
  }

  await withTransaction(async (client) => {
    const access = await dbQueryOne<{ group_id: string }>(
      `SELECT w.group_id
       FROM reading_items ri
       JOIN weeks w ON w.id = ri.week_id
       JOIN group_members gm ON gm.group_id = w.group_id
       WHERE ri.id = $1
         AND gm.user_id = $2`,
      [params.readingItemId, params.userId],
      client,
    );

    if (!access) {
      throw new ServiceError("Reading item not found or access denied", 404);
    }

    let parentAuthorId: string | null = null;
    if (params.parentId) {
      const parent = await dbQueryOne<{ id: string; author_id: string; parent_id: string | null }>(
        `SELECT id, author_id, parent_id
         FROM comments
         WHERE id = $1
           AND reading_item_id = $2
           AND deleted_at IS NULL`,
        [params.parentId, params.readingItemId],
        client,
      );

      if (!parent) {
        throw new ServiceError("Parent comment not found", 404);
      }
      if (parent.parent_id) {
        throw new ServiceError("Only 1-level replies are allowed", 422);
      }

      parentAuthorId = parent.author_id;
    }

    const inserted = await dbQueryOne<{ id: string }>(
      `INSERT INTO comments(reading_item_id, parent_id, author_id, text)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [params.readingItemId, params.parentId ?? null, params.userId, text],
      client,
    );

    const mentionHandles = extractMentionHandles(text);
    const mentionedUsers = mentionHandles.length
      ? await dbQuery<{ id: string }>(
          `SELECT u.id
           FROM users u
           JOIN group_members gm ON gm.user_id = u.id
           JOIN weeks w ON w.group_id = gm.group_id
           JOIN reading_items ri ON ri.week_id = w.id
           WHERE ri.id = $1
             AND lower(regexp_replace(u.name, '\\s+', '', 'g')) = ANY($2::text[])`,
          [params.readingItemId, mentionHandles],
          client,
        )
      : [];

    const uniqueMentionTargets = Array.from(
      new Set(mentionedUsers.map((user) => user.id).filter((id) => id !== params.userId)),
    );

    if (parentAuthorId && parentAuthorId !== params.userId) {
      await notifyUsers(
        [parentAuthorId],
        "COMMENT_REPLY",
        "Someone replied to your comment.",
        { readingItemId: params.readingItemId, commentId: inserted?.id },
        client,
      );
    }

    if (uniqueMentionTargets.length > 0) {
      await notifyUsers(
        uniqueMentionTargets,
        "MENTION",
        "You were mentioned in discussion.",
        { readingItemId: params.readingItemId, commentId: inserted?.id },
        client,
      );
    }
  });

  return { ok: true };
}

export async function editComment(params: { commentId: string; userId: string; text: string }) {
  const text = params.text.trim();
  if (!text) {
    throw new ServiceError("Comment cannot be empty", 422);
  }
  if (text.length > 500) {
    throw new ServiceError("Comment exceeds 500 characters", 422);
  }

  const comment = await dbQueryOne<{ author_id: string; created_at: string; deleted_at: string | null }>(
    `SELECT author_id, created_at::text, deleted_at::text
     FROM comments
     WHERE id = $1`,
    [params.commentId],
  );

  if (!comment || comment.deleted_at) {
    throw new ServiceError("Comment not found", 404);
  }
  if (comment.author_id !== params.userId) {
    throw new ServiceError("Only the author can edit this comment", 403);
  }

  const ageMs = Date.now() - new Date(comment.created_at).getTime();
  if (ageMs > 5 * 60 * 1000) {
    throw new ServiceError("Comment edit window (5 minutes) has passed", 400);
  }

  await dbQuery(
    `UPDATE comments
     SET text = $1,
         updated_at = NOW()
     WHERE id = $2`,
    [text, params.commentId],
  );

  return { ok: true };
}

export async function deleteComment(params: { commentId: string; userId: string }) {
  const comment = await dbQueryOne<{ author_id: string; deleted_at: string | null }>(
    `SELECT author_id, deleted_at::text
     FROM comments
     WHERE id = $1`,
    [params.commentId],
  );

  if (!comment || comment.deleted_at) {
    throw new ServiceError("Comment not found", 404);
  }
  if (comment.author_id !== params.userId) {
    throw new ServiceError("Only the author can delete this comment", 403);
  }

  await dbQuery(`UPDATE comments SET deleted_at = NOW() WHERE id = $1`, [params.commentId]);

  return { ok: true };
}

export async function getNotifications(userId: string) {
  const notifications = await dbQuery<{
    id: string;
    type: string;
    text: string;
    metadata: Record<string, unknown>;
    created_at: string;
    read_at: string | null;
  }>(
    `SELECT id, type::text, text, metadata, created_at::text, read_at::text
     FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 30`,
    [userId],
  );

  return notifications.map((notification) => ({
    id: notification.id,
    type: notification.type,
    text: notification.text,
    metadata: notification.metadata,
    createdAt: notification.created_at,
    readAt: notification.read_at,
  }));
}

export async function updateGroupSettings(params: {
  groupId: string;
  userId: string;
  votingDurationHours?: number;
  tiePolicy?: TiePolicy;
  liveTally?: boolean;
}) {
  await requireAdmin(params.groupId, params.userId);

  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (params.votingDurationHours !== undefined) {
    const hours = Math.max(1, Math.min(168, params.votingDurationHours));
    updates.push(`voting_duration_hours = $${paramIndex++}`);
    values.push(hours);
  }
  if (params.tiePolicy !== undefined) {
    updates.push(`tie_policy = $${paramIndex++}`);
    values.push(params.tiePolicy);
  }
  if (params.liveTally !== undefined) {
    updates.push(`live_tally = $${paramIndex++}`);
    values.push(params.liveTally);
  }

  if (updates.length === 0) {
    throw new ServiceError("No settings to update", 422);
  }

  values.push(params.groupId);
  await dbQuery(
    `UPDATE groups SET ${updates.join(", ")} WHERE id = $${paramIndex}`,
    values,
  );

  return { ok: true };
}

export async function createGroup(params: {
  name: string;
  timezone: string;
  ownerId: string;
  tiePolicy?: TiePolicy;
  liveTally?: boolean;
  votingDurationHours?: number;
}) {
  const name = params.name.trim().slice(0, 80);
  if (!name) {
    throw new ServiceError("Group name is required", 422);
  }

  const user = await dbQueryOne<{ id: string }>(`SELECT id FROM users WHERE id = $1`, [params.ownerId]);
  if (!user) {
    throw new ServiceError("Owner user not found", 404);
  }

  const votingHours = params.votingDurationHours
    ? Math.max(1, Math.min(168, params.votingDurationHours))
    : 68;

  return withTransaction(async (client) => {
    const group = await dbQueryOne<{ id: string }>(
      `INSERT INTO groups(name, timezone, owner_id, tie_policy, live_tally, voting_duration_hours)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [name, params.timezone || "America/New_York", params.ownerId, params.tiePolicy ?? "ADMIN_PICK", params.liveTally ?? true, votingHours],
      client,
    );

    await dbQuery(
      `INSERT INTO group_members(group_id, user_id, role)
       VALUES ($1, $2, 'OWNER')
       ON CONFLICT (group_id, user_id) DO UPDATE SET role = 'OWNER'`,
      [group?.id, params.ownerId],
      client,
    );

    return { groupId: group?.id };
  });
}

export async function createInvite(params: { groupId: string; userId: string; expiresInDays?: number }) {
  await requireAdmin(params.groupId, params.userId);

  const token = crypto.randomBytes(6).toString("base64url");
  const expiresAt = params.expiresInDays
    ? new Date(Date.now() + params.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  await dbQuery(
    `INSERT INTO invites(group_id, token, created_by, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [params.groupId, token, params.userId, expiresAt],
  );

  return { token };
}

export async function createPersonalInvite(params: {
  groupId: string;
  userId: string;
  recipientName: string;
  recipientContact?: string;
}) {
  await requireMembership(params.groupId, params.userId);

  const name = params.recipientName.trim().slice(0, 80);
  if (!name) throw new ServiceError("Recipient name is required", 422);

  const token = crypto.randomBytes(6).toString("base64url");

  await dbQuery(
    `INSERT INTO invites(group_id, token, created_by, recipient_name, recipient_contact, status)
     VALUES ($1, $2, $3, $4, $5, 'pending')`,
    [params.groupId, token, params.userId, name, params.recipientContact?.trim() || null],
  );

  return { token };
}

export async function getPendingInvites(groupId: string, userId: string) {
  await requireMembership(groupId, userId);

  const rows = await dbQuery<{
    id: string;
    token: string;
    recipient_name: string;
    recipient_contact: string | null;
    created_by: string;
    creator_name: string;
    created_at: string;
  }>(
    `SELECT i.id, i.token, i.recipient_name, i.recipient_contact,
            i.created_by, u.name AS creator_name, i.created_at::text
     FROM invites i
     JOIN users u ON u.id = i.created_by
     WHERE i.group_id = $1
       AND i.status = 'pending'
       AND i.recipient_name IS NOT NULL
       AND (i.expires_at IS NULL OR i.expires_at > NOW())
     ORDER BY i.created_at DESC`,
    [groupId],
  );

  return rows.map((r) => ({
    id: r.id,
    token: r.token,
    recipientName: r.recipient_name,
    recipientContact: r.recipient_contact,
    createdBy: r.created_by,
    creatorName: r.creator_name,
    createdAt: r.created_at,
  }));
}

export async function cancelInvite(params: { inviteId: string; groupId: string; userId: string }) {
  const member = await requireMembership(params.groupId, params.userId);

  const invite = await dbQueryOne<{ id: string; created_by: string; status: string }>(
    `SELECT id, created_by, status
     FROM invites
     WHERE id = $1 AND group_id = $2`,
    [params.inviteId, params.groupId],
  );

  if (!invite) throw new ServiceError("Invite not found", 404);
  if (invite.status !== "pending") throw new ServiceError("Invite is not pending", 400);

  const isInviteAdmin = mapRoleWeight(member.role) >= mapRoleWeight("ADMIN");
  if (invite.created_by !== params.userId && !isInviteAdmin) {
    throw new ServiceError("Only the inviter or an admin can cancel this invite", 403);
  }

  await dbQuery(`UPDATE invites SET status = 'cancelled' WHERE id = $1`, [params.inviteId]);
  return { ok: true };
}

export async function getInviteByToken(token: string) {
  return dbQueryOne<{
    group_id: string;
    group_name: string;
    creator_name: string;
    recipient_name: string | null;
  }>(
    `SELECT i.group_id, g.name AS group_name, u.name AS creator_name, i.recipient_name
     FROM invites i
     JOIN groups g ON g.id = i.group_id
     JOIN users u ON u.id = i.created_by
     WHERE i.token = $1
       AND (i.expires_at IS NULL OR i.expires_at > NOW())
       AND i.status != 'cancelled'`,
    [token],
  );
}

export async function joinGroupByInvite(params: { token: string; userId: string }) {
  const invite = await dbQueryOne<{ group_id: string; id: string; recipient_name: string | null }>(
    `SELECT group_id, id, recipient_name
     FROM invites
     WHERE token = $1
       AND (expires_at IS NULL OR expires_at > NOW())`,
    [params.token],
  );

  if (!invite) {
    throw new ServiceError("Invite is invalid or expired", 404);
  }

  await dbQuery(
    `INSERT INTO group_members(group_id, user_id, role)
     VALUES ($1, $2, 'MEMBER')
     ON CONFLICT (group_id, user_id) DO NOTHING`,
    [invite.group_id, params.userId],
  );

  // Mark personal invites as accepted
  if (invite.recipient_name) {
    await dbQuery(
      `UPDATE invites SET status = 'accepted', accepted_by = $1 WHERE id = $2 AND status = 'pending'`,
      [params.userId, invite.id],
    );
  }

  return { groupId: invite.group_id };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function ensureDemoData() {
  const userCount = await dbQueryOne<{ count: string }>(`SELECT COUNT(*)::text FROM users`);
  if (Number(userCount?.count ?? 0) > 0) {
    return;
  }

  await withTransaction(async (client) => {
    const users = [
      { name: "Adil", email: "adil@example.com", language: "en" },
      { name: "Marcus", email: "marcus@example.com", language: "en" },
      { name: "Sarah", email: "sarah@example.com", language: "es" },
      { name: "David", email: "david@example.com", language: "en" },
      { name: "Priya", email: "priya@example.com", language: "hi" },
      { name: "Noah", email: "noah@example.com", language: "fr" },
    ];

    const userIds = new Map<string, string>();
    for (const user of users) {
      const inserted = await dbQueryOne<{ id: string }>(
        `INSERT INTO users(name, email, default_language)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [user.name, user.email, user.language],
        client,
      );
      if (inserted?.id) {
        userIds.set(user.email, inserted.id);
      }
    }

    const ownerId = userIds.get("adil@example.com");
    const group = await dbQueryOne<{ id: string }>(
      `INSERT INTO groups(name, timezone, owner_id, tie_policy, live_tally)
       VALUES ('Friends Group', 'America/New_York', $1, 'EARLIEST', true)
       RETURNING id`,
      [ownerId],
      client,
    );

    const members = [
      "adil@example.com",
      "marcus@example.com",
      "sarah@example.com",
      "david@example.com",
      "priya@example.com",
    ];

    for (const email of members) {
      await dbQuery(
        `INSERT INTO group_members(group_id, user_id, role)
         VALUES ($1, $2, $3)`,
        [group?.id, userIds.get(email), email === "adil@example.com" ? "OWNER" : "MEMBER"],
        client,
      );
    }

    await dbQuery(
      `INSERT INTO invites(group_id, token, created_by)
       VALUES ($1, 'friends-group', $2)
       ON CONFLICT (token) DO NOTHING`,
      [group?.id, ownerId],
      client,
    );
  });
}

export async function rerollSeedProposal(params: {
  groupId: string;
  userId: string;
  proposalId: string;
}) {
  await requireAdmin(params.groupId, params.userId);

  const proposal = await dbQueryOne<{ id: string; week_id: string; is_seed: boolean; week_status: WeekStatus }>(
    `SELECT p.id, p.week_id, p.is_seed, w.status AS week_status
     FROM proposals p
     JOIN weeks w ON w.id = p.week_id
     WHERE p.id = $1 AND w.group_id = $2 AND p.deleted_at IS NULL`,
    [params.proposalId, params.groupId],
  );

  if (!proposal) throw new ServiceError("Proposal not found", 404);
  if (!proposal.is_seed) throw new ServiceError("Only seed proposals can be rerolled", 400);

  // Soft-delete the old seed
  await dbQuery(`UPDATE proposals SET deleted_at = NOW() WHERE id = $1`, [params.proposalId]);

  // Get already-used references (read + current proposals)
  const [pastRefs, currentRefs] = await Promise.all([
    dbQuery<{ reference: string }>(
      `SELECT DISTINCT ri.reference FROM reading_items ri
       JOIN weeks w ON w.id = ri.week_id WHERE w.group_id = $1`,
      [params.groupId],
    ),
    dbQuery<{ reference: string }>(
      `SELECT reference FROM proposals WHERE week_id = $1 AND deleted_at IS NULL`,
      [proposal.week_id],
    ),
  ]);

  const excluded = [...pastRefs.map((r) => r.reference), ...currentRefs.map((r) => r.reference)];
  const seeds = pickSeedPassages(1, excluded);

  if (seeds.length > 0) {
    const group = await getGroup(params.groupId);
    await dbQuery(
      `INSERT INTO proposals(week_id, proposer_id, reference, note, is_seed)
       VALUES ($1, $2, $3, $4, TRUE)`,
      [proposal.week_id, group.owner_id, seeds[0].reference, seeds[0].note],
    );
  }

  if (proposal.week_status !== "RESOLVED") {
    await ensureWeekReadingItem(proposal.week_id);
  }

  return { ok: true };
}

export async function startNewVote(params: { groupId: string; userId: string }) {
  await requireMembership(params.groupId, params.userId);

  // Verify current week is resolved
  const latestWeek = await dbQueryOne<WeekRow>(
    `${WEEK_SELECT} WHERE group_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [params.groupId],
  );

  if (!latestWeek) throw new ServiceError("No previous week found", 400);
  if (latestWeek.status !== "RESOLVED") {
    throw new ServiceError("Current vote must be resolved before starting a new one", 400);
  }

  const group = await getGroup(params.groupId);
  const votingHours = group.voting_duration_hours;

  const newWeek = await dbQueryOne<{ id: string; start_date: string }>(
    `INSERT INTO weeks(group_id, start_date, voting_close_at, status)
     VALUES ($1, CURRENT_DATE, NOW() + (interval '1 hour' * $2::int), 'VOTING_OPEN')
     RETURNING id, start_date::text`,
    [params.groupId, votingHours],
  );

  if (!newWeek) throw new ServiceError("Failed to create new vote round", 500);

  await insertSeedProposals(params.groupId, newWeek.id, group.owner_id, 3, newWeek.start_date);
  await ensureWeekReadingItem(newWeek.id);

  await notifyGroupMembers(
    params.groupId,
    "VOTING_OPENED",
    "A new vote round has started!",
    { groupId: params.groupId, weekId: newWeek.id },
    params.userId,
  );

  return { weekId: newWeek.id };
}

export async function getUserGroups(userId: string) {
  return dbQuery<{
    id: string;
    name: string;
    timezone: string;
    role: GroupRole;
    invite_token: string | null;
  }>(
    `SELECT g.id, g.name, g.timezone, gm.role,
       (
         SELECT i.token
         FROM invites i
         WHERE i.group_id = g.id
           AND (i.expires_at IS NULL OR i.expires_at > NOW())
         ORDER BY i.created_at DESC
         LIMIT 1
       ) AS invite_token
     FROM groups g
     JOIN group_members gm ON gm.group_id = g.id
     WHERE gm.user_id = $1
     ORDER BY gm.joined_at ASC`,
    [userId],
  );
}

export async function getBootstrapData() {
  const users = await dbQuery<{
    id: string;
    name: string;
    email: string;
    default_language: string;
  }>(
    `SELECT id, name, email, default_language
     FROM users
     ORDER BY created_at ASC`,
  );

  return {
    now: nowIso(),
    users: users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      language: user.default_language,
    })),
  };
}

export async function runWeeklyRollover(params?: { groupId?: string }) {
  const targetGroups = params?.groupId
    ? [{ id: params.groupId }]
    : await dbQuery<{ id: string }>(
        `SELECT id
         FROM groups
         ORDER BY created_at ASC`,
      );

  const processedGroupIds: string[] = [];
  const failed: Array<{ groupId: string; error: string }> = [];

  for (const group of targetGroups) {
    try {
      await ensureCurrentWeek(group.id);
      processedGroupIds.push(group.id);
    } catch (error) {
      failed.push({
        groupId: group.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return {
    processed: processedGroupIds.length,
    failed: failed.length,
    processedGroupIds,
    failures: failed,
  };
}

/* ─── Verse Annotations ─── */

async function requireReadingAccess(
  readingItemId: string,
  userId: string,
): Promise<{ groupId: string }> {
  const access = await dbQueryOne<{ group_id: string }>(
    `SELECT w.group_id
     FROM reading_items ri
     JOIN weeks w ON w.id = ri.week_id
     JOIN group_members gm ON gm.group_id = w.group_id
     WHERE ri.id = $1
       AND gm.user_id = $2`,
    [readingItemId, userId],
  );
  if (!access) throw new ServiceError("Reading item not found or access denied", 404);
  return { groupId: access.group_id };
}

export async function getAnnotations(readingItemId: string, userId: string) {
  await requireReadingAccess(readingItemId, userId);

  const annotations = await dbQuery<{
    id: string;
    author_id: string;
    author_name: string;
    start_verse: number;
    end_verse: number;
    text: string;
    created_at: string;
  }>(
    `SELECT a.id, a.author_id, u.name AS author_name,
            a.start_verse, a.end_verse, a.text, a.created_at::text
     FROM annotations a
     JOIN users u ON u.id = a.author_id
     WHERE a.reading_item_id = $1
       AND a.deleted_at IS NULL
     ORDER BY a.start_verse ASC, a.created_at ASC`,
    [readingItemId],
  );

  const annotationIds = annotations.map((a) => a.id);
  const replies = annotationIds.length > 0
    ? await dbQuery<{
        id: string;
        annotation_id: string;
        author_id: string;
        author_name: string;
        text: string;
        created_at: string;
      }>(
        `SELECT ar.id, ar.annotation_id, ar.author_id, u.name AS author_name,
                ar.text, ar.created_at::text
         FROM annotation_replies ar
         JOIN users u ON u.id = ar.author_id
         WHERE ar.annotation_id = ANY($1::uuid[])
           AND ar.deleted_at IS NULL
         ORDER BY ar.created_at ASC`,
        [annotationIds],
      )
    : [];

  return annotations.map((a) => ({
    id: a.id,
    authorId: a.author_id,
    authorName: a.author_name,
    startVerse: a.start_verse,
    endVerse: a.end_verse,
    text: a.text,
    createdAt: a.created_at,
    canDelete: a.author_id === userId,
    replies: replies
      .filter((r) => r.annotation_id === a.id)
      .map((r) => ({
        id: r.id,
        authorId: r.author_id,
        authorName: r.author_name,
        text: r.text,
        createdAt: r.created_at,
        canDelete: r.author_id === userId,
      })),
  }));
}

export async function createAnnotation(params: {
  readingItemId: string;
  userId: string;
  startVerse: number;
  endVerse: number;
  text: string;
}) {
  const text = params.text.trim();
  if (!text) throw new ServiceError("Comment cannot be empty", 422);
  if (text.length > 500) throw new ServiceError("Comment exceeds 500 characters", 422);
  if (params.startVerse < 1 || params.endVerse < params.startVerse) {
    throw new ServiceError("Invalid verse range", 422);
  }

  await requireReadingAccess(params.readingItemId, params.userId);

  const annotation = await dbQueryOne<{ id: string }>(
    `INSERT INTO annotations(reading_item_id, author_id, start_verse, end_verse, text)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [params.readingItemId, params.userId, params.startVerse, params.endVerse, text],
  );

  return { annotationId: annotation?.id ?? null };
}

export async function createAnnotationReply(params: {
  annotationId: string;
  userId: string;
  text: string;
}) {
  const text = params.text.trim();
  if (!text) throw new ServiceError("Reply cannot be empty", 422);
  if (text.length > 500) throw new ServiceError("Reply exceeds 500 characters", 422);

  const annotation = await dbQueryOne<{ id: string; reading_item_id: string }>(
    `SELECT a.id, a.reading_item_id
     FROM annotations a
     WHERE a.id = $1
       AND a.deleted_at IS NULL`,
    [params.annotationId],
  );

  if (!annotation) throw new ServiceError("Annotation not found", 404);
  await requireReadingAccess(annotation.reading_item_id, params.userId);

  const reply = await dbQueryOne<{ id: string }>(
    `INSERT INTO annotation_replies(annotation_id, author_id, text)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [params.annotationId, params.userId, text],
  );

  return { replyId: reply?.id ?? null };
}

export async function deleteAnnotation(params: { annotationId: string; userId: string }) {
  const annotation = await dbQueryOne<{ author_id: string; deleted_at: string | null }>(
    `SELECT author_id, deleted_at::text FROM annotations WHERE id = $1`,
    [params.annotationId],
  );

  if (!annotation || annotation.deleted_at) throw new ServiceError("Annotation not found", 404);
  if (annotation.author_id !== params.userId) {
    throw new ServiceError("Only the author can delete this annotation", 403);
  }

  await dbQuery(`UPDATE annotations SET deleted_at = NOW() WHERE id = $1`, [params.annotationId]);
  return { ok: true };
}

export async function deleteAnnotationReply(params: { replyId: string; userId: string }) {
  const reply = await dbQueryOne<{ author_id: string; deleted_at: string | null }>(
    `SELECT author_id, deleted_at::text FROM annotation_replies WHERE id = $1`,
    [params.replyId],
  );

  if (!reply || reply.deleted_at) throw new ServiceError("Reply not found", 404);
  if (reply.author_id !== params.userId) {
    throw new ServiceError("Only the author can delete this reply", 403);
  }

  await dbQuery(`UPDATE annotation_replies SET deleted_at = NOW() WHERE id = $1`, [params.replyId]);
  return { ok: true };
}

/* ─── Proposal Comments ─── */

export async function getProposalComments(proposalId: string, userId: string) {
  // Verify access: user must be in the group that owns this proposal
  const access = await dbQueryOne<{ group_id: string }>(
    `SELECT w.group_id
     FROM proposals p
     JOIN weeks w ON w.id = p.week_id
     JOIN group_members gm ON gm.group_id = w.group_id
     WHERE p.id = $1 AND gm.user_id = $2 AND p.deleted_at IS NULL`,
    [proposalId, userId],
  );
  if (!access) throw new ServiceError("Proposal not found or access denied", 404);

  const comments = await dbQuery<{
    id: string;
    author_id: string;
    author_name: string;
    text: string;
    created_at: string;
  }>(
    `SELECT pc.id, pc.author_id, u.name AS author_name, pc.text, pc.created_at::text
     FROM proposal_comments pc
     JOIN users u ON u.id = pc.author_id
     WHERE pc.proposal_id = $1 AND pc.deleted_at IS NULL
     ORDER BY pc.created_at ASC`,
    [proposalId],
  );

  // Mark as read
  await dbQuery(
    `INSERT INTO proposal_comment_reads(user_id, proposal_id, last_read_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id, proposal_id)
     DO UPDATE SET last_read_at = NOW()`,
    [userId, proposalId],
  );

  return comments.map((c) => ({
    id: c.id,
    authorId: c.author_id,
    authorName: c.author_name,
    text: c.text,
    createdAt: c.created_at,
    canDelete: c.author_id === userId,
  }));
}

export async function createProposalComment(params: {
  proposalId: string;
  userId: string;
  text: string;
}) {
  const text = params.text.trim();
  if (!text) throw new ServiceError("Comment cannot be empty", 422);
  if (text.length > 500) throw new ServiceError("Comment exceeds 500 characters", 422);

  const access = await dbQueryOne<{ group_id: string }>(
    `SELECT w.group_id
     FROM proposals p
     JOIN weeks w ON w.id = p.week_id
     JOIN group_members gm ON gm.group_id = w.group_id
     WHERE p.id = $1 AND gm.user_id = $2 AND p.deleted_at IS NULL`,
    [params.proposalId, params.userId],
  );
  if (!access) throw new ServiceError("Proposal not found or access denied", 404);

  const comment = await dbQueryOne<{ id: string }>(
    `INSERT INTO proposal_comments(proposal_id, author_id, text)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [params.proposalId, params.userId, text],
  );

  // Mark as read for the commenter
  await dbQuery(
    `INSERT INTO proposal_comment_reads(user_id, proposal_id, last_read_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id, proposal_id)
     DO UPDATE SET last_read_at = NOW()`,
    [params.userId, params.proposalId],
  );

  return { commentId: comment?.id ?? null };
}

/* ─── User Profile ─── */

const AVATAR_PRESETS = ["cross", "dove", "fish", "olive", "lamp", "hands", "scroll", "star"];

export async function getUserProfile(userId: string) {
  const user = await dbQueryOne<{
    id: string;
    name: string;
    email: string;
    avatar_preset: string | null;
    avatar_image: string | null;
    created_at: string;
  }>(
    `SELECT id, name, email, avatar_preset, avatar_image, created_at::text
     FROM users WHERE id = $1`,
    [userId],
  );
  if (!user) throw new ServiceError("User not found", 404);
  return user;
}

export async function updateUserProfile(params: {
  userId: string;
  name?: string;
  avatarPreset?: string | null;
  avatarImage?: string | null;
}) {
  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (params.name !== undefined) {
    const name = params.name.trim();
    if (!name || name.length > 60) throw new ServiceError("Name must be 1-60 characters", 422);
    updates.push(`name = $${paramIndex++}`);
    values.push(name);
  }

  if (params.avatarPreset !== undefined) {
    if (params.avatarPreset !== null && !AVATAR_PRESETS.includes(params.avatarPreset)) {
      throw new ServiceError("Invalid avatar preset", 422);
    }
    updates.push(`avatar_preset = $${paramIndex++}`);
    values.push(params.avatarPreset);
    // Setting preset clears image
    if (params.avatarPreset !== null) {
      updates.push(`avatar_image = NULL`);
    }
  }

  if (params.avatarImage !== undefined) {
    if (params.avatarImage !== null) {
      if (!params.avatarImage.startsWith("data:image/")) {
        throw new ServiceError("Invalid image format", 422);
      }
      if (params.avatarImage.length > 150000) {
        throw new ServiceError("Image too large (max ~100KB)", 422);
      }
    }
    updates.push(`avatar_image = $${paramIndex++}`);
    values.push(params.avatarImage);
    // Setting image clears preset
    if (params.avatarImage !== null) {
      updates.push(`avatar_preset = NULL`);
    }
  }

  if (updates.length === 0) throw new ServiceError("No fields to update", 422);

  values.push(params.userId);
  await dbQuery(
    `UPDATE users SET ${updates.join(", ")} WHERE id = $${paramIndex}`,
    values,
  );

  return { ok: true };
}

export async function getUserReadHistory(userId: string) {
  const rows = await dbQuery<{
    reference: string;
    start_date: string;
    group_name: string;
  }>(
    `SELECT ri.reference, w.start_date::text, g.name AS group_name
     FROM read_marks rm
     JOIN reading_items ri ON ri.id = rm.reading_item_id
     JOIN weeks w ON w.id = ri.week_id
     JOIN groups g ON g.id = w.group_id
     WHERE rm.user_id = $1 AND rm.status = 'READ'
     ORDER BY w.start_date DESC
     LIMIT 50`,
    [userId],
  );

  const total = await dbQueryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM read_marks WHERE user_id = $1 AND status = 'READ'`,
    [userId],
  );

  return {
    totalRead: Number(total?.count ?? 0),
    items: rows.map((r) => ({
      reference: r.reference,
      startDate: r.start_date,
      groupName: r.group_name,
    })),
  };
}

export async function getUserCommentHistory(userId: string) {
  const rows = await dbQuery<{
    id: string;
    text: string;
    created_at: string;
    source: string;
    context: string;
  }>(
    `(
      SELECT c.id, c.text, c.created_at::text, 'comment' AS source,
             ri.reference AS context
      FROM comments c
      JOIN reading_items ri ON ri.id = c.reading_item_id
      WHERE c.author_id = $1 AND c.deleted_at IS NULL
    )
    UNION ALL
    (
      SELECT pc.id, pc.text, pc.created_at::text, 'proposal_comment' AS source,
             p.reference AS context
      FROM proposal_comments pc
      JOIN proposals p ON p.id = pc.proposal_id
      WHERE pc.author_id = $1 AND pc.deleted_at IS NULL
    )
    UNION ALL
    (
      SELECT a.id, a.text, a.created_at::text, 'annotation' AS source,
             ri.reference AS context
      FROM annotations a
      JOIN reading_items ri ON ri.id = a.reading_item_id
      WHERE a.author_id = $1 AND a.deleted_at IS NULL
    )
    UNION ALL
    (
      SELECT ar.id, ar.text, ar.created_at::text, 'annotation_reply' AS source,
             ri.reference AS context
      FROM annotation_replies ar
      JOIN annotations a ON a.id = ar.annotation_id
      JOIN reading_items ri ON ri.id = a.reading_item_id
      WHERE ar.author_id = $1 AND ar.deleted_at IS NULL
    )
    ORDER BY created_at DESC
    LIMIT 50`,
    [userId],
  );

  return rows.map((r) => ({
    id: r.id,
    text: r.text,
    createdAt: r.created_at,
    source: r.source,
    context: r.context,
  }));
}

export async function deleteProposalComment(params: { commentId: string; userId: string }) {
  const comment = await dbQueryOne<{ author_id: string; deleted_at: string | null }>(
    `SELECT author_id, deleted_at::text FROM proposal_comments WHERE id = $1`,
    [params.commentId],
  );

  if (!comment || comment.deleted_at) throw new ServiceError("Comment not found", 404);
  if (comment.author_id !== params.userId) {
    throw new ServiceError("Only the author can delete this comment", 403);
  }

  await dbQuery(`UPDATE proposal_comments SET deleted_at = NOW() WHERE id = $1`, [params.commentId]);
  return { ok: true };
}
