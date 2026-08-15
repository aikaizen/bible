# TODO - Roadmap to v0.2

Current release: `v0.1`
Target release: `v0.2`

## v0.2 Goals
- Stabilize weekly lifecycle so passage continuity is guaranteed without manual intervention.
- Improve real-time collaboration in Reader + Discussion.
- Harden security/ops for Supabase + Vercel production usage.

## P0 - Voting / Selection Experience (Primetime)

Captured 2026-08-14. Requirements as stated, not yet specced.

- [ ] **Open proposals to all members.** Any member of a group can propose specific passages — not admin-only.
- [ ] **Proposals are visible to everyone, capped per user.** Any proposed passage automatically appears for all users. Each user can propose up to 2 passages per week.
- [ ] **Partial-verse highlighting in Reader.** Highlighting text must not auto-expand to the full verse when the selection is incomplete — highlight only the selected words. The comment still reads "Comment on verse 5" and stays tagged as such in the comments at the bottom.
- [ ] **Remove the reroll button in the top right.**
- [ ] **Replace "This week is resolved" with a rollover timer.** No resolved-state banner at the bottom. Instead show a countdown of days remaining until next week, when the verses in play switch and the current week is archived to history.
- [ ] **Voting protects a passage from reroll.** Voting on a verse makes it non-rerollable; the reroll control for that passage goes gray.

## P1 - Week History and Snapshot Impersonation

- [ ] Maintain a history of past weeks, accessible from the right bar.
- [ ] Snapshot each week exactly as it stood immediately before it ended and rolled over.
- [ ] Clicking a snapshot enters an "impersonation" view of that week: all passages readable as they were, with full ability to comment and reply.
- [ ] Changes made while impersonating are written back into that snapshot, so discussion on a past passage can continue.
- [ ] While impersonating, show indicator text at the top next to the group name.

## Parking Lot - Deferred Until After Primetime

- [ ] Deacon AI assistant (`lib/deacon.ts`, Fireworks API, bot user, `docs/plans/deacon-ai-assistant.md`).
- [ ] Super admin role and cross-group member management.
- [ ] Email notifications via Resend (including `PASSAGE_READ` notification type and unsubscribe flow).

## P0 - Must Fix Before v0.2 Tag
- [x] Add lifecycle integration tests for week creation, vote casting, auto-resolve, and new vote rounds.
- [x] Add deterministic service tests for random fallback behavior (stub RNG for test mode).
- [x] Add concurrency protection tests for simultaneous votes/resolves to prevent race conditions.
- [x] Ensure comments remain accessible during vote transitions and after new round creation.
- [x] Add idempotent scheduled rollover job (Vercel Cron + API) to create/resolve weeks even when no client opens app.
- [ ] Run full CI verification for new test suite in a network-enabled environment.

## P1 - Product Updates for v0.2
- [ ] Reader continuity improvements:
- [ ] Show "current shared reading" + "next vote leader" badge when they differ.
- [ ] Add explicit "switch shared reading now" admin action with audit notification.
- [ ] Discussion improvements:
- [ ] Add reactions (heart/like).
- [ ] Add thread sort options (newest, most replied).
- [ ] Voting improvements:
- [ ] Add optional "resolve on majority reached" toggle.
- [ ] Add clear tie-resolution message in UI when random tie-break is used.

## P1 - Realtime and UX
- [ ] Add Supabase Realtime subscriptions for proposals, votes, reading item, and comments.
- [ ] Remove manual refresh dependency for core group actions.
- [ ] Improve loading/error states for passage fetch and comment posting.
- [ ] Add optimistic updates for comments/replies with rollback on failure.

## P1 - Security and Data Integrity
- [ ] Verify all API routes rely strictly on server session user identity (no client identity inputs).
- [ ] Add rate limiting for proposal creation, voting, and comments.
- [ ] Add content moderation guardrails for comments/proposal notes.
- [ ] Add stricter DB constraints where needed (status transitions, foreign key consistency).

## P2 - Observability and Operations
- [ ] Add structured server logs (action, group_id, user_id, latency, outcome).
- [ ] Add lightweight analytics events for vote participation and comment activity.
- [ ] Add health endpoint and DB connectivity checks.
- [ ] Add alerting thresholds for failed resolve jobs and API error spikes.

## Release Checklist (v0.2)
- [ ] `npm run lint` passes.
- [ ] `npm run build` passes.
- [ ] Manual QA pass across auth, groups, vote lifecycle, reader sync, comments, and notifications.
- [ ] Changelog updated with `v0.2` final notes.
- [ ] Tag and deploy to Vercel production.
