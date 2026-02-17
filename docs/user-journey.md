# User Journey Plan

## Overview

Bible Vote is a group Bible reading app. Each week, a group votes on what to read next. The winning passage becomes the group's reading for the week, and the actual Bible text is displayed in-app so members can read it without leaving. Members mark their progress, discuss what they read, and then the cycle repeats.

---

## Journey 1: First-Time User

### 1.1 Open the App
- User sees the app with a user selector (no auth yet, demo mode)
- If the user has no groups, they see an empty state: "You're not in any groups yet"
- Two paths forward: **Create a group** or **Join a group**

### 1.2 Join a Group (via invite token)
- Someone shares an invite token (e.g. `friends-group`)
- User pastes it into the invite token input and clicks Join
- The group appears in their group dropdown, snapshot loads
- They're now a MEMBER and can vote, read, and discuss

### 1.3 Create a Group
- User clicks "+ Group", types a name, clicks Create
- They become the OWNER of the new group
- The group starts empty: no members, no votes, no readings yet
- They can generate an invite token and share it with friends

---

## Journey 2: Weekly Voting Cycle

### 2.1 Voting Opens
A new vote opens automatically at the start of each week (Monday, based on the group's timezone). The vote includes:

- **Seed proposals**: The system pre-populates 2-3 suggested Bible passages so there's always something to vote on, even if no one nominates. These are curated to provide variety (mix of Old Testament, New Testament, Psalms, etc.) and avoid repeating passages the group has already read.
- **User nominations**: Any member can propose a passage at any time while voting is open.

### 2.2 Nominate a Passage
- User clicks "+ Propose passage"
- Types a Bible reference (e.g. "Romans 8:1-17")
- Optionally adds a note explaining why ("Paul's thesis on life in the Spirit")
- The proposal appears in the list alongside seed proposals
- Reference format is validated (book + chapter + optional verse range)

### 2.3 Cast a Vote
- User sees all proposals: seed suggestions and member nominations
- Each proposal shows: reference, note, who proposed it, vote count (if live tally is on)
- User clicks "Vote" on their preferred passage
- One vote per person per week; voting again changes their vote
- Voting closes automatically (default: Wednesday 8pm group timezone)

### 2.4 Winner Selected
- When voting closes, the app resolves the winner:
  - **Clear winner**: Highest votes wins automatically
  - **Tie**: Resolved by group policy (admin pick, random, or earliest proposal)
  - **No votes/proposals**: Falls to PENDING_MANUAL, admin picks
- All members get a notification: "This week's reading is Romans 8:1-17"
- The app transitions from voting mode to reading mode

### 2.5 24-Hour Reminder
- If a member hasn't voted and voting closes within 24 hours, they get a reminder notification

---

## Journey 3: Reading Period

### 3.1 View the Reading
- User navigates to the "This Week" tab
- They see the winning passage displayed prominently:
  - **Reference**: e.g. "Romans 8:1-17"
  - **Proposer**: who nominated it and their note
  - **The full Bible text** rendered directly in the app (fetched from an API like ESV or API.Bible)
- The text is displayed in a clean, readable format with verse numbers
- User can read the entire passage without leaving the app

### 3.2 Mark Reading Progress
- Below the Bible text, three status buttons:
  - **Not Marked** (default) - haven't started
  - **Planned** - intend to read it
  - **Read** - finished reading
- The group can see everyone's status: "Sarah: read, David: planned, Marcus: none"
- This creates gentle accountability without pressure

### 3.3 Discuss the Reading
- Below the reading status, a discussion section
- Members can post short reflections (up to 500 characters)
- Comments support 1-level replies and @mentions
- Mentioned users get notified
- Authors can edit comments within 5 minutes, delete anytime

---

## Journey 4: Ongoing Participation

### 4.1 Switch Between Groups
- User can be in multiple groups (e.g. "Small Group", "Family", "College Friends")
- Group dropdown in the header switches between them
- Each group has its own independent voting cycle, readings, and discussions

### 4.2 View History
- "History" tab shows past readings (last 8 weeks)
- Each entry shows: passage reference, week date, comment count, read count
- Tapping a past reading opens its discussion thread (future enhancement)

### 4.3 Check the Squad
- "Squad" tab shows group member stats
- Per member: proposals this week, voted status, read status
- Aggregate: total members, total votes this week

### 4.4 Notifications
- Bell icon in header shows unread notifications
- Types: voting opened, 24h reminder, winner selected, comment reply, @mention

---

## Journey 5: Admin Actions

### 5.1 Manage Voting
- Admins/owners can resolve voting early (pick a winner before the deadline)
- If there's a tie with ADMIN_PICK policy, admin sees "Pick Winner" buttons on tied proposals
- Admins can remove inappropriate proposals

### 5.2 Manage Group
- Generate new invite tokens (with optional expiration)
- Group settings: timezone, tie-breaking policy, live tally toggle

---

## Key Feature: In-App Bible Text

### What Exists Today
The app stores Bible passage **references** only (e.g. "John 3:16-21"). Users must look up the text themselves.

### What Needs to Be Built
When a reading is selected (or a proposal is being previewed), the app fetches and displays the actual Bible text.

**Source options (pick one):**
| API | Free Tier | Translations | Notes |
|-----|-----------|-------------|-------|
| ESV API (api.esv.org) | 500 req/day | ESV only | Clean text, well-documented |
| API.Bible | 5000 req/day | 2500+ translations | More complex response format |
| Bible API (bible-api.com) | Unlimited | KJV, WEB, others | Simple, no API key needed |

**Implementation approach:**
- Backend proxy route: `GET /api/bible?reference=Romans+8:1-17`
- Caches responses (passages don't change) in-memory or database
- Frontend renders verse-by-verse with verse numbers
- Displayed on the "This Week" tab when a reading is resolved
- Also shown as a preview when browsing proposals (optional, future)

---

## Key Feature: Seed Proposals

### What Exists Today
Each week starts with zero proposals. Members must manually propose passages.

### What Needs to Be Built
When a new week's vote opens, the system auto-creates 2-3 seed proposals.

**Seed strategy:**
- Maintain a curated list of ~200 popular/meaningful passages across the Bible
- When a new week is created, pick 2-3 that the group hasn't read before
- Seed proposals have no proposer (system-generated), marked distinctly in the UI
- Members can still nominate their own passages on top of the seeds
- Seeds can be removed by admins if unwanted

**Passage categories for variety:**
- Old Testament narrative (Genesis, Exodus, Joshua, etc.)
- Psalms and Proverbs (wisdom literature)
- Prophets (Isaiah, Jeremiah, etc.)
- Gospels (Matthew, Mark, Luke, John)
- Epistles (Romans, Corinthians, Ephesians, etc.)
- Revelation and apocalyptic

---

## Week-at-a-Glance

```
Monday          Tuesday         Wednesday       Thursday ... Sunday
|--- Voting Open ---|--- Voting Closes ---|--- Reading Period ---|
                         8pm (group tz)

  - Seeds appear         - Winner picked     - Bible text visible
  - Members nominate     - Notification       - Mark read status
  - Members vote           sent               - Discussion open
  - 24h reminder
```

---

## State Transitions

```
NEW WEEK
  |
  v
VOTING_OPEN  -->  members propose & vote
  |
  | (voting_close_at passes)
  v
[auto-resolve attempt]
  |
  +--> clear winner --> RESOLVED --> reading period begins
  |
  +--> tie + RANDOM/EARLIEST --> RESOLVED
  |
  +--> tie + ADMIN_PICK --> PENDING_MANUAL --> admin picks --> RESOLVED
  |
  +--> no votes/proposals --> PENDING_MANUAL --> admin picks --> RESOLVED
```

---

## What's Already Built vs. What's New

| Feature | Status | Notes |
|---------|--------|-------|
| User selection (demo, no auth) | Done | |
| Multi-group support | Done | Create, join, switch groups |
| Weekly voting cycle | Done | Auto-open, auto-close, auto-resolve |
| Propose passages | Done | Reference validation, notes |
| Cast votes | Done | One per person, changeable |
| Tie-breaking policies | Done | ADMIN_PICK, RANDOM, EARLIEST |
| Mark reading progress | Done | NOT_MARKED, PLANNED, READ |
| Discussion / comments | Done | Replies, @mentions, edit/delete |
| Notifications | Done | 5 types, in-app display |
| History | Done | Last 8 weeks |
| Squad stats | Done | Per-member activity |
| Invite system | Done | Shareable tokens |
| **In-app Bible text** | **Not built** | Fetch + display actual passage text |
| **Seed proposals** | **Not built** | Auto-populate votes with suggestions |
| **Configurable vote duration** | **Not built** | Let groups choose voting window |
| **Auth** | **Not built** | Currently demo user-switcher |
