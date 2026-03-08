# PRD: Redesign Voting into Passage Discovery & Discussion

## Problem Statement

The current app revolves around a **weekly voting cycle** — every week, a vote opens, closes on a timer, a "winner" is picked, and only then can the group read and discuss that passage. This creates several issues:

1. **Artificial urgency** — The weekly deadline forces resolution even when nobody cares about the outcome
2. **Gate on discussion** — Users can't read/discuss a passage until the vote resolves, which kills spontaneous engagement
3. **Misplaced emphasis** — The vote is the main event, but what actually matters is reading and discussing together
4. **No notification pull** — The in-app notification system exists but doesn't reach users where they actually are (email/push), so engagement drops between sessions

## Vision

Shift from "vote to pick a winner" to **"here are passages to explore together — discuss, vote to show interest, archive when done."** The group always has a living list of passages. Seed suggestions refresh weekly. User-added passages float to the top. Discussion is the core activity, not vote resolution.

---

## What Stays (Already Good)

- **Seed passages** — The curated 200-passage list with weekly refresh is great. Keep it.
- **Voting/upvoting** — Users can still vote on passages to signal interest. Keep the mechanic, just decouple it from resolution.
- **Reroll** — Admins can still swap out seed suggestions. Keep it.
- **Proposal comments** — Per-passage discussion during browsing. Keep and elevate.
- **Reading view** — Bible text display, annotations, verse highlights. All great.
- **Read marks** — Marking passages as read. Keep it.
- **Groups, invites, profiles** — All solid. Keep as-is.
- **Annotations & replies** — Verse-level discussion is a killer feature. Keep it.

## What Changes

### 1. Remove Weekly Vote Resolution Cycle

**Current:** Weeks have `VOTING_OPEN` → `RESOLVED` → reading unlocked.
**New:** There is no "resolution." The passage list is always live. Any passage can be tapped into to read and discuss at any time.

#### Specifics:
- **Drop** the `weeks` table as the organizing concept. Replace with a **`passage_list`** concept — the group's current living list of passages.
- **Drop** `voting_close_at`, `resolved_reading_id`, `status` (VOTING_OPEN/RESOLVED/PENDING_MANUAL) from the flow.
- **Drop** the "Start New Vote" button and weekly resolution logic.
- **Drop** tie-breaking policies (ADMIN_PICK, RANDOM, EARLIEST) — no longer needed.
- **Keep** the vote count on each passage as a signal of interest (like upvotes), not as a mechanism to pick a winner.

### 2. Passage List (Replaces Weeks + Proposals)

The group has a **single living passage list** that members browse together.

#### Composition:
- **Seed passages** (3) — Auto-generated weekly from the curated list, refreshed each Monday. Tagged as "Suggested." These rotate out each week if not interacted with (no votes, no comments, no reads).
- **User-added passages** — Added by any group member. Tagged with proposer name. These **persist** until archived. Always sorted above seeds.

#### Sorting:
1. User-added passages (sorted by vote count desc, then newest first)
2. Seed passages (sorted by vote count desc, then creation order)

#### Schema change:
- New table `passages` replaces `proposals`:
  ```
  passages (
    id UUID PK,
    group_id UUID FK → groups,
    added_by UUID FK → users,
    reference TEXT,
    note TEXT,
    is_seed BOOLEAN,
    seed_week DATE,         -- which week this seed was generated for (NULL for user-added)
    archived_at TIMESTAMPTZ, -- NULL = active, set = archived
    archived_by UUID,        -- who initiated the archive
    created_at TIMESTAMPTZ
  )
  ```
- `votes` table simplified:
  ```
  votes (
    id UUID PK,
    passage_id UUID FK → passages,
    user_id UUID FK → users,
    created_at TIMESTAMPTZ,
    UNIQUE(passage_id, user_id)  -- one vote per passage per user (no week constraint)
  )
  ```
- `reading_items` linked to `passages` instead of `weeks`:
  ```
  reading_items (
    id UUID PK,
    passage_id UUID FK → passages,
    reference TEXT,
    created_at TIMESTAMPTZ
  )
  ```

### 3. Archive Flow (Replaces Resolution)

When a user-added passage has served its purpose (group has read and discussed it), any member can **propose archiving** it. This triggers a lightweight vote:

- **Archive button** appears on user-added passages (not seeds — seeds just rotate out)
- Tapping "Archive" creates an **archive proposal**
- Group members see a banner: *"[User] proposed archiving [Passage]. Archive?"* with Yes/No
- If majority of active members vote yes (or admin approves), the passage moves to History
- Archived passages retain all their comments, annotations, and read marks — they just leave the active list
- Schema: `archive_votes` table or a flag on the existing votes

#### Simpler alternative (recommended for v1):
- **Admin/proposer archive**: Only the person who added the passage (or an admin) can archive it directly — no vote needed. Single tap.
- This avoids complexity. If the group wants it back, someone just re-adds it.

### 4. Weekly Seed Refresh

Seeds refresh each Monday (based on group timezone), same as today:

- Old seeds that received **no interaction** (no votes, no comments, no read marks) are quietly removed
- Old seeds that **did** receive interaction stay on the list until they naturally get archived or fade
- 3 new seeds are added, avoiding duplicates of anything currently on the list or in history
- The deterministic seeding by date is kept so groups see the same suggestions

### 5. Email Notifications (New)

This is the most important new feature. Currently, notifications only exist in-app — users have to open the app to see them. We need to **reach users via email** for key events.

#### Email triggers:
| Event | Email? | Content |
|-------|--------|---------|
| New comment on a passage you've interacted with | Yes | "[User] commented on [Passage]: [preview]" |
| Reply to your comment | Yes | "[User] replied to your comment on [Passage]: [preview]" |
| @mention | Yes | "[User] mentioned you in [Passage]: [preview]" |
| New user-added passage | Yes | "[User] added [Passage] to the group" |
| Weekly seed refresh | Yes (digest) | "This week's suggested readings: [3 passages]" |
| New annotation on a passage you've read | Yes | "[User] highlighted [verses] in [Passage]" |

#### Implementation:
- Use a **transactional email service** (Resend, SendGrid, or AWS SES — Resend recommended for simplicity on Vercel)
- Add `email_notifications` boolean to `users` table (default true) and an unsubscribe link in every email
- **Batch/digest option**: Users can choose "immediate" or "daily digest" for non-urgent notifications
- Email templates: simple, text-forward, mobile-friendly. Match the app's dark aesthetic or keep plain.

#### Schema additions:
```sql
ALTER TABLE users ADD COLUMN email_notifications BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN email_digest_mode TEXT DEFAULT 'immediate'; -- 'immediate' | 'daily'

CREATE TABLE email_queue (
  id UUID PK,
  user_id UUID FK,
  type TEXT,
  subject TEXT,
  body TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  error TEXT
);
```

### 6. UI Changes

#### Vote Tab → "Passages" Tab
- Rename from "Vote" to "Passages" (or "This Week" or "Explore")
- Remove "This Week's Vote / Closes Mar 11 / 3 days left" header
- Replace with: **"Group Passages"** header with passage count
- User-added passages appear at top with proposer attribution
- Seed passages below with "Suggested" badge (keep existing badge style)
- Each passage card shows:
  - Reference + note
  - Vote count (upvote button, not "cast your vote")
  - Comment count (tap to expand discussion)
  - Read status indicators (who in the group has read it)
  - "Read" button → opens reading view directly (no need to wait for resolution)
  - "Archive" button (on user-added passages, for proposer/admin)

#### Reading Tab
- No longer gated behind vote resolution
- User taps "Read" on any passage → opens the reading view with Bible text
- All existing reading features work: annotations, comments, verse highlights, read marks
- Back button returns to passage list

#### Bottom Nav
- "Vote" tab icon/label → "Passages" (or keep the existing icon, just change label)
- Everything else stays the same

### 7. What to Remove/Simplify

- `weeks` table — migrate to passage-list model (can keep for historical data)
- `voting_close_at`, `voting_duration_hours` — no longer needed
- `tie_policy` — no longer needed
- `resolved_reading_id` — passages link directly to reading_items
- `VOTING_OPEN / RESOLVED / PENDING_MANUAL` status enum — no longer needed
- `live_tally` group setting — the list is always live
- "Start New Vote" button — gone
- Weekly resolution cron logic — replaced with weekly seed refresh cron
- `VOTING_OPENED`, `VOTING_REMINDER`, `WINNER_SELECTED` notification types — replaced with new types

---

## Migration Strategy

This is a significant schema change. Approach:

1. **New tables alongside old** — Create `passages` table, migrate existing `proposals` data
2. **Map existing data**: Each existing `proposal` becomes a `passage`. Existing `votes` get remapped. Existing `reading_items` get linked to passages.
3. **Historical weeks** → become archived passages in History tab (no data loss)
4. **Feature flag** — Could do a hard cutover since the user base is small (group of friends app)

---

## Implementation Phases

### Phase 1: Schema & Core Model (Backend)
- Create `passages` table, migrate from `proposals`
- Update `votes` to reference `passages` instead of `weeks`
- Update `reading_items` to reference `passages`
- Add archive fields to `passages`
- Update service layer: remove week resolution logic, add passage CRUD
- Update `/api/groups/[groupId]/active-week` → `/api/groups/[groupId]/passages`
- Weekly seed refresh cron (simplified from current weekly rollover)

### Phase 2: UI Overhaul (Frontend)
- Rename Vote tab → Passages tab
- Remove voting deadline UI, resolution UI, "Start New Vote"
- Make every passage tappable into reading view
- Add Archive button on user-added passages
- Update sorting (user-added first, then seeds)
- Remove group settings for tie_policy, voting_duration

### Phase 3: Email Notifications
- Integrate Resend (or similar) for transactional email
- Add email preference fields to users table
- Implement email queue + sending for each trigger
- Add unsubscribe mechanism
- Weekly digest cron for digest-mode users

### Phase 4: Polish
- Clean up dead code (week resolution, tie breaking, etc.)
- Update CLAUDE.md and schema.sql
- Test edge cases (empty groups, single member, etc.)

---

## Open Questions

1. **How many seed passages per week?** Currently 3. Keep at 3?
2. **Should seeds that got interaction persist forever or auto-archive after N weeks?** Recommendation: persist until manually archived or until they've been on the list for 4 weeks with no new activity.
3. **Email provider preference?** Resend is simplest for Vercel. SES is cheapest at scale. SendGrid is the enterprise default.
4. **Should the "Passages" tab show a reading preview (first few verses)?** Could increase engagement but adds API calls.
5. **Archive vote vs. direct archive?** Recommendation: direct archive by proposer/admin for v1, consider group vote for v2.
