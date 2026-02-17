import crypto from "node:crypto";
import { PoolClient } from "pg";

import { dbQuery, dbQueryOne, withTransaction } from "./db";
import { isValidReference, normalizeReference } from "./reference";
import { pickSeedPassages } from "./seed-passages";

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

async function insertSeedProposals(
  groupId: string,
  weekId: string,
  ownerId: string,
): Promise<void> {
  // Get all references the group has already read or proposed
  const pastReferences = await dbQuery<{ reference: string }>(
    `SELECT DISTINCT ri.reference
     FROM reading_items ri
     JOIN weeks w ON w.id = ri.week_id
     WHERE w.group_id = $1`,
    [groupId],
  );

  const alreadyRead = pastReferences.map((r) => r.reference);
  const seeds = pickSeedPassages(3, alreadyRead);

  for (const seed of seeds) {
    await dbQuery(
      `INSERT INTO proposals(week_id, proposer_id, reference, note, is_seed)
       VALUES ($1, $2, $3, $4, TRUE)`,
      [weekId, ownerId, seed.reference, seed.note],
    );
  }
}

async function ensureCurrentWeekExists(groupId: string): Promise<WeekRow> {
  const group = await getGroup(groupId);
  const meta = await getCurrentWeekMeta(groupId);

  const inserted = await dbQueryOne<{ id: string }>(
    `INSERT INTO weeks(group_id, start_date, voting_close_at, status)
     VALUES ($1, $2::date, $3::timestamptz, 'VOTING_OPEN')
     ON CONFLICT (group_id, start_date) DO NOTHING
     RETURNING id`,
    [groupId, meta.startDate, meta.closeAt],
  );

  if (inserted) {
    // Insert seed proposals for the new week
    await insertSeedProposals(groupId, inserted.id, group.owner_id);

    await notifyGroupMembers(
      groupId,
      "VOTING_OPENED",
      "Voting is open for this week's reading.",
      { groupId, weekId: inserted.id, startDate: meta.startDate, closeAt: meta.closeAt },
      undefined,
    );
  }

  const week = await dbQueryOne<WeekRow>(
    `SELECT id, group_id, start_date::text, voting_close_at::text, resolved_reading_id, status, reminder_sent_at::text
     FROM weeks
     WHERE group_id = $1 AND start_date = $2::date`,
    [group.id, meta.startDate],
  );

  if (!week) {
    throw new ServiceError("Unable to create or load current week", 500);
  }

  return week;
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
     GROUP BY p.id, u.name
     ORDER BY COUNT(v.id) DESC, p.created_at ASC`,
    [weekId],
  );

  if (proposals.length === 0) {
    return { proposalId: null, status: "PENDING_MANUAL", reason: "NO_PROPOSALS" };
  }

  const topVotes = Number(proposals[0].vote_count);
  if (topVotes <= 0) {
    return { proposalId: null, status: "PENDING_MANUAL", reason: "NO_VOTES" };
  }

  const tied = proposals.filter((proposal) => Number(proposal.vote_count) === topVotes);
  if (tied.length === 1) {
    return { proposalId: tied[0].id, status: "RESOLVED" };
  }

  if (tiePolicy === "ADMIN_PICK") {
    return { proposalId: null, status: "PENDING_MANUAL", reason: "TIE_ADMIN_PICK" };
  }

  if (tiePolicy === "RANDOM") {
    const pick = tied[Math.floor(Math.random() * tied.length)];
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
      `SELECT id, group_id, start_date::text, voting_close_at::text, resolved_reading_id, status, reminder_sent_at::text
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
    await dbQuery(`UPDATE weeks SET status = 'PENDING_MANUAL' WHERE id = $1`, [week.id]);
    return;
  }

  await finalizeWeek(week.id, winner.proposalId);
}

async function ensureCurrentWeek(groupId: string): Promise<WeekRow> {
  const week = await ensureCurrentWeekExists(groupId);
  await maybeSendVotingReminder(week);
  await maybeAutoResolveWeek(week);

  const refreshedWeek = await dbQueryOne<WeekRow>(
    `SELECT id, group_id, start_date::text, voting_close_at::text, resolved_reading_id, status, reminder_sent_at::text
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

  const [members, proposals, votes, myVote, readingItem, history, invite] = await Promise.all([
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
       GROUP BY p.id, u.name
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
         w.start_date::text,
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
       GROUP BY w.id, ri.reference
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
  ]);

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
  };
}

export async function addProposal(params: {
  groupId: string;
  userId: string;
  reference: string;
  note?: string;
}) {
  const week = await ensureCurrentWeek(params.groupId);
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

  const proposal = await dbQueryOne<{ proposer_id: string; week_id: string }>(
    `SELECT p.proposer_id, p.week_id
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

  return { ok: true };
}

export async function castVote(params: { groupId: string; userId: string; proposalId: string }) {
  const week = await ensureCurrentWeek(params.groupId);
  await requireMembership(params.groupId, params.userId);

  if (week.status !== "VOTING_OPEN" || isPast(week.voting_close_at)) {
    throw new ServiceError("Voting is closed", 400);
  }

  const exists = await dbQueryOne<{ id: string }>(
    `SELECT p.id
     FROM proposals p
     WHERE p.id = $1
       AND p.week_id = $2
       AND p.deleted_at IS NULL`,
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

  return { ok: true };
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

export async function joinGroupByInvite(params: { token: string; userId: string }) {
  const invite = await dbQueryOne<{ group_id: string }>(
    `SELECT group_id
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
