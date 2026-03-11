# Bible App Master Context (As of 2026-03-05)

## 1) Current Snapshot

- Repo: `bible-reading-companion` (Next.js App Router + PostgreSQL).
- Branch/HEAD reviewed: `main` @ `608a368` (`2026-02-22`, message: `feat: add Group link in drawer, merge annotations into Discussion`).
- Working tree was already dirty before this review (multiple modified API/service/frontend files).
- Auth is live: Google OAuth via NextAuth v5, plus an admin credentials path.

## 2) What Is Implemented Today

### Core product features

- Group-based weekly reading workflow with roles (`OWNER`, `ADMIN`, `MEMBER`).
- Weekly vote lifecycle with:
  - auto week creation,
  - seed proposals,
  - vote casting/changing,
  - tie policies (`ADMIN_PICK`, `RANDOM`, `EARLIEST`),
  - auto/manual resolution,
  - manual “start new vote round”.
- Shared reading item per week (`reading_items`) with read marks (`NOT_MARKED`, `PLANNED`, `READ`).
- In-app Bible text fetch proxy (`/api/bible`) with in-memory caching.
- Discussion system:
  - top-level comments + 1-level replies,
  - mention notifications,
  - edit window (5 minutes),
  - soft delete.
- Verse annotation system:
  - highlights by verse range,
  - annotation replies,
  - deletion controls.
- Proposal comments:
  - per-proposal discussion,
  - read-tracking for unread counts.
- Invite system:
  - generic invites,
  - personal invites (`recipient_name`, `recipient_contact`, status tracking).
- Notifications:
  - voting opened/reminder/winner,
  - comment replies,
  - mentions,
  - passage-read nudges.
- User profile:
  - name updates,
  - avatar presets,
  - uploaded avatar image (data URL, bounded size),
  - read/comment history.
- Super-admin capabilities:
  - add/remove members,
  - role changes across groups.

### AI assistant feature

- `Deacon` bot support exists in service layer:
  - triggers on `@deacon` mentions,
  - uses Fireworks chat completion API,
  - posts automated replies into comments/annotation threads,
  - silently no-ops if API key missing.

### Scheduling/ops

- Cron route: `/api/cron/weekly-rollover` with `CRON_SECRET` auth.
- Vercel cron configured for daily trigger in `vercel.json`.

## 3) Auth, Security Model, and Access Pattern

### Auth

- NextAuth v5 (`lib/auth.ts`) with:
  - Google provider (primary),
  - credentials provider (`admin`) for superadmin login.
- Session strategy: JWT.
- App DB user id is embedded in token/session (`dbId` => `session.user.id`).

### API protection pattern

- Most API routes call `getAuthUser()` and use server-side session identity.
- `userId` path segments in `/api/users/[userId]/...` are currently ignored; identity comes from session.

## 4) Database and Domain Model Status

`db/schema.sql` includes:

- Core entities: `users`, `groups`, `group_members`, `weeks`, `proposals`, `votes`, `reading_items`, `comments`, `read_marks`, `notifications`, `invites`.
- Newer entities: `annotations`, `annotation_replies`, `proposal_comments`, `proposal_comment_reads`.
- Newer user columns: `google_id`, `avatar_preset`, `avatar_image`, `is_bot`, `is_superadmin`.
- Notification enum extended with `PASSAGE_READ`.
- Schema is idempotent migration style (many `IF NOT EXISTS` blocks).

## 5) API Surface (Current)

- Auth: `/api/auth/[...nextauth]`
- Group lifecycle:
  - `/api/groups`
  - `/api/groups/[groupId]/active-week`
  - `/api/groups/[groupId]/proposals`
  - `/api/groups/[groupId]/vote`
  - `/api/groups/[groupId]/resolve`
  - `/api/groups/[groupId]/new-vote`
  - `/api/groups/[groupId]/settings`
  - `/api/groups/[groupId]/proposals/reroll`
- Group membership/invites:
  - `/api/groups/[groupId]/invites`
  - `/api/groups/[groupId]/members`
  - `/api/invites/[token]`
  - `/api/invites/[token]/join`
- Reading/discussion:
  - `/api/reading-items/[readingItemId]/read-mark`
  - `/api/reading-items/[readingItemId]/comments`
  - `/api/comments/[commentId]`
  - `/api/comments/[commentId]/reply`
  - `/api/reading-items/[readingItemId]/annotations`
  - `/api/annotations/[annotationId]`
  - `/api/annotations/[annotationId]/replies`
  - `/api/annotation-replies/[replyId]`
  - `/api/proposals/[proposalId]/comments`
  - `/api/proposal-comments/[commentId]`
- User APIs:
  - `/api/users/[userId]/groups`
  - `/api/users/[userId]/notifications`
  - `/api/users/[userId]/profile`
- Infra:
  - `/api/bible`
  - `/api/cron/weekly-rollover`
  - `/api/bootstrap`

## 6) Full Review Findings (Ordered by Severity)

### P0 (critical)

1. Unauthenticated user directory/PII exposure via bootstrap route.
   - Evidence: `app/api/bootstrap/route.ts:4`, `lib/service.ts:1910`.
   - Behavior: Anyone can call `/api/bootstrap` and receive all users including email addresses.
   - Risk: Immediate data exposure in production.

2. Invite cancellation and personal-invite one-time semantics are bypassable.
   - Evidence: `lib/service.ts:1595-1601`, `lib/service.ts:1555-1574`.
   - Behavior: `joinGroupByInvite` validates only token + expiry, not `status='pending'`; cancelled invites can still join, and accepted personal invites can be reused.
   - Risk: Revoked links remain usable; personal invites are not truly single-use.

### P1 (high)

3. Error leakage to clients on unexpected server failures.
   - Evidence: `lib/api.ts:21-22`.
   - Behavior: 500 responses include raw `error.message`.
   - Risk: Internal implementation details leak to clients.

4. Invite privacy overexposure to all members.
   - Evidence: `lib/service.ts:1520-1552`.
   - Behavior: Any member can view pending personal invite tokens + recipient contact.
   - Risk: Unnecessary access to personal metadata and active join links.

5. Test harness schema drift breaks the test suite.
   - Evidence: `tests/helpers/test-db.ts:49-56`, missing invite fields used by service (`status`, `recipient_name`, `recipient_contact`, `accepted_by`).
   - Behavior: `npm run test` fails with `column "i.status" does not exist`.
   - Risk: No effective CI safety net for lifecycle logic right now.

### P2 (medium)

6. Weak admin password verification strategy.
   - Evidence: `lib/auth.ts:29-37`.
   - Behavior: direct SHA-256 hash compare for admin password.
   - Risk: weaker brute-force resistance vs Argon2id/bcrypt.

7. Timezone values are not validated before persistence.
   - Evidence: `lib/service.ts:1438-1466`, `lib/service.ts:1398-1433`.
   - Behavior: arbitrary timezone strings can be stored and later used in lifecycle SQL.
   - Risk: malformed values can break week calculations/reminders/rollover.

8. Public Bible cache is unbounded in memory.
   - Evidence: `app/api/bible/route.ts:3-15`, `app/api/bible/route.ts:62`.
   - Behavior: unbounded `Map` with long TTL on public input keys.
   - Risk: memory growth/abuse risk.

### P3 (low)

9. Docs have drift against current implementation.
   - Evidence: `docs/changelog.md`, `README.md`, `tests/helpers/test-db.ts`.
   - Examples:
     - README “Important” still says auth provider is missing.
     - Test infrastructure no longer matches current schema.

## 7) Verification Run Results

- `npm run test` on 2026-03-05: **failed**.
  - 5 failures across lifecycle/random/comment-concurrency suites.
  - Common root cause: test schema missing invite columns now required by service queries.
- `npm run lint` on 2026-03-05: **passed with warnings only**.
  - Warning: `@next/next/no-img-element` in `app/page.tsx` lines 849 and 1334.

## 8) Existing TODO Inventory

### Explicit TODO checkboxes (from `docs/roadmap/todo-v0.2.md`)

- [ ] Run full CI verification for new test suite in a network-enabled environment.
- [ ] Show “current shared reading” + “next vote leader” badge when they differ.
- [ ] Add explicit “switch shared reading now” admin action with audit notification.
- [ ] Add reactions (heart/like).
- [ ] Add thread sort options (newest, most replied).
- [ ] Add optional “resolve on majority reached” toggle.
- [ ] Add clear tie-resolution message in UI when random tie-break is used.
- [ ] Add Supabase Realtime subscriptions for proposals, votes, reading item, and comments.
- [ ] Remove manual refresh dependency for core group actions.
- [ ] Improve loading/error states for passage fetch and comment posting.
- [ ] Add optimistic updates for comments/replies with rollback on failure.
- [ ] Verify all API routes rely strictly on server session user identity (no client identity inputs).
- [ ] Add rate limiting for proposal creation, voting, and comments.
- [ ] Add content moderation guardrails for comments/proposal notes.
- [ ] Add stricter DB constraints where needed (status transitions, foreign key consistency).
- [ ] Add structured server logs (action, group_id, user_id, latency, outcome).
- [ ] Add lightweight analytics events for vote participation and comment activity.
- [ ] Add health endpoint and DB connectivity checks.
- [ ] Add alerting thresholds for failed resolve jobs and API error spikes.
- [ ] `npm run lint` passes.
- [ ] `npm run build` passes.
- [ ] Manual QA pass across auth, groups, vote lifecycle, reader sync, comments, and notifications.
- [ ] Changelog updated with `v0.2` final notes.
- [ ] Tag and deploy to Vercel production.

### Additional backlog signals in other docs

- `docs/user-journey.md` has two “What Needs to Be Built” sections, including:
  - richer Bible reader experience and proposal previews,
  - expanded seed-proposal curation/logic.
- `docs/reviews/2026-02-22-prelaunch-review.md` lists unresolved testing/security hardening gaps.
- `docs/strategy/marketing-plan.md` contains major growth/SEO/community roadmap items (non-engineering heavy).

## 9) Documentation Reorganization Completed

Root markdown files were reviewed and centralized under `docs/`:

- `CHANGELOG.md` -> `docs/changelog.md`
- `TODO.md` -> `docs/roadmap/todo-v0.2.md`
- `Deacon-plan.md` -> `docs/plans/deacon-ai-assistant.md`
- `Feb22-codereview.md` -> `docs/reviews/2026-02-22-prelaunch-review.md`
- `MARKETING-PLAN.md` -> `docs/strategy/marketing-plan.md`
- `CLAUDE.md` copied to `docs/reference/claude-project-notes.md` (source left in root)

## 10) Recommended Execution Order (Pragmatic)

1. Fix invite status enforcement + personal invite single-use semantics.
2. Lock down/remove `/api/bootstrap`.
3. Sync `tests/helpers/test-db.ts` schema with `db/schema.sql` so tests run again.
4. Replace SHA-256 admin hash check with Argon2id/bcrypt.
5. Add timezone validation and route-level rate limiting.
6. Add bounded LRU behavior to Bible cache.
7. Update README/changelog after code and test fixes land.

