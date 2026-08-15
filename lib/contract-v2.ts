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
