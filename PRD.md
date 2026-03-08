# PRD: Refine Voting into Passage Discovery & Discussion

## Context

The app is already very good. This is **not a rewrite** — it's a refinement. We're removing the weekly vote-resolution deadline and letting the passage list breathe, while keeping everything that works.

## Problem

The weekly voting cycle creates artificial pressure to resolve a "winner" on a timer. In practice, the group just wants to see passages, discuss them, and read together. The deadline and resolution mechanics get in the way.

## What Changes (Summary)

1. **Remove the weekly deadline/resolution flow** — no more `VOTING_OPEN → RESOLVED` gating
2. **Passages are always readable and discussable** — tap any passage to read it
3. **Votes and comments drive ranking** — more engagement = higher in the list
4. **Seed passages auto-archive weekly** if they got no interaction; replaced with fresh ones
5. **User-added passages persist** until proposer/admin archives them
6. **Read status tracking** — opening a passage auto-marks you as "reading" (yellow), manual "read" (green) when done
7. **Email notifications** — reach users where they are

---

## What Stays (No Changes)

- Seed passages (curated 200-passage list, 3 per week, deterministic by date)
- Reroll for admins
- Voting mechanic (upvote to show interest)
- Per-passage comments and discussion
- Reading view (Bible text, annotations, verse highlights)
- Read marks (but enhanced — see below)
- Groups, invites, profiles, avatars
- Annotations & replies
- Proposal creation (user adds a passage to the group)

---

## Changes in Detail

### 1. Remove Weekly Resolution Cycle

**Drop from the flow:**
- `voting_close_at` deadline and countdown UI ("Closes Mar 11 · 3 days left")
- Vote resolution logic (tie-breaking, ADMIN_PICK/RANDOM/EARLIEST)
- `VOTING_OPEN / RESOLVED / PENDING_MANUAL` status states
- "Start New Vote" button
- `live_tally` group setting
- `resolved_reading_id` on weeks

**Keep:**
- The `weeks` table can stay as a lightweight container for seed generation timing
- Vote counts on passages — they now drive sort order, not pick a winner

### 2. Passage List Ranking

All active passages for a group appear in one list. Sorting:

1. **User-added passages first** — sorted by engagement score (votes + comments), then newest
2. **Seed ("Suggested") passages below** — sorted by engagement score, then creation order

This means votes are **still important** — more votes and more comments push a passage to the top.

### 3. Seed Passage Lifecycle

Each Monday (group timezone):
- **Auto-archive** any seed passages from previous weeks that received **zero interaction** (no votes, no comments, no read marks)
- Seeds that **did** receive interaction stay on the active list — they earned their spot
- **3 new seeds** are generated, avoiding duplicates with active list and history
- Deterministic seeding by date preserved (groups see same suggestions)

### 4. Archive Flow

- **Seed passages**: Auto-archived weekly if no interaction. No manual action needed.
- **User-added passages**: An **"Archive" button** appears, visible to the **proposer and admins**. Single tap archives — moves to History with all comments/annotations preserved.
- Archived passages are viewable in the History tab.
- If someone wants an archived passage back, they just re-add it.

### 5. Read Status Enhancement

Each passage tracks per-user read status with three states:

| State | Color | Trigger |
|-------|-------|---------|
| **Unread** | Grey | Default — user hasn't opened it |
| **Reading** | Yellow | Auto-set when user opens/taps into the passage |
| **Read** | Green | Manual — user marks it as read (existing "Read" button) |

- The passage card shows read status indicators for all group members (colored dots or avatars)
- This record persists on archived passages too

### 6. Reading Tab Behavior

The Reading tab shows **whatever passage the user last opened** (most recent "reading" or "read" passage). No longer gated behind vote resolution.

- User taps "Read" on any passage card → opens reading view
- Reading tab remembers their last-opened passage
- All existing features work: Bible text, annotations, comments, verse highlights, read marks

### 7. UI Changes

**Vote Tab → "Passages" Tab:**
- Remove "This Week's Vote / Closes Mar 11 / 3 days left" header
- Replace with simple passage list header
- Each passage card shows: reference, note, vote count, comment count, group read status
- "Vote" button stays (upvote mechanic unchanged)
- "Read" button on every card → opens reading view
- "Archive" button on user-added passages (proposer/admin only)
- "Comments" button stays (inline discussion)

**Reading Tab:**
- Shows last-opened passage (not just the "resolved winner")
- Otherwise identical to current reading view

**Bottom Nav:**
- "Vote" label → "Passages"
- Everything else unchanged

### 8. Email Notifications

Currently notifications are in-app only. Add email delivery for key events:

| Event | Email Content |
|-------|--------------|
| Reply to your comment | "[User] replied to your comment on [Passage]" |
| @mention | "[User] mentioned you in [Passage]" |
| New comment on a passage you've interacted with | "[User] commented on [Passage]" |
| New user-added passage in your group | "[User] added [Passage]" |
| Weekly seed refresh | Digest: "This week's suggested readings: [3 passages]" |

**Implementation:**
- Resend (recommended for Vercel) or similar transactional email service
- `email_notifications` preference per user (default on), with unsubscribe link
- Optional daily digest mode vs. immediate
- Simple, text-forward email templates

---

## Schema Changes

These are **incremental changes** to existing tables, not a rewrite.

### Modify `proposals` table (rename to `passages` or keep as-is with new columns):
```sql
ALTER TABLE proposals ADD COLUMN group_id UUID REFERENCES groups(id);
ALTER TABLE proposals ADD COLUMN archived_at TIMESTAMPTZ;
ALTER TABLE proposals ADD COLUMN archived_by UUID REFERENCES users(id);
ALTER TABLE proposals ADD COLUMN seed_week DATE;
```

### Modify `votes` table:
```sql
-- Change unique constraint from (week_id, user_id) to (proposal_id, user_id)
-- Users can now vote on multiple passages, one vote per passage
```

### Modify `read_marks` to support 3 states:
```sql
-- Existing status enum: NOT_MARKED | PLANNED | READ
-- Map: NOT_MARKED → unread (grey), PLANNED → reading (yellow), READ → read (green)
-- Auto-set PLANNED when user opens a passage
```

### Add email fields to `users`:
```sql
ALTER TABLE users ADD COLUMN email_notifications BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN email_digest_mode TEXT DEFAULT 'immediate';
```

### Add `email_queue` table:
```sql
CREATE TABLE email_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  type TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ,
  error TEXT
);
```

---

## Implementation Phases

### Phase 1: Core Model Changes (Backend)
- Add `group_id`, `archived_at`, `archived_by`, `seed_week` to proposals
- Update vote unique constraint (per-passage instead of per-week)
- Update service layer: remove resolution logic, add archive, update ranking query
- Update active-week endpoint to return ranked passage list without deadline info
- Simplify weekly cron to: auto-archive stale seeds, generate new seeds

### Phase 2: UI Updates (Frontend)
- Rename Vote → Passages, remove deadline/resolution UI
- Make every passage card tappable into reader
- Add Archive button on user-added passages
- Update Reading tab to show last-opened passage
- Auto-set "reading" status when user opens a passage
- Update sorting to engagement-based ranking

### Phase 3: Email Notifications
- Integrate Resend
- Add email preferences to user profile
- Wire up email sending for comment replies, mentions, new passages, weekly digest
- Add unsubscribe flow

---

## What We're NOT Doing

- Not rewriting the schema from scratch — incremental ALTER TABLEs
- Not changing the group/invite/profile systems
- Not touching auth
- Not redesigning the reading view or annotation system
- Not adding push notifications (email first, push later if needed)
- Not changing the seed passage curation list
