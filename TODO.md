# TODO - Roadmap to v0.2

Current release: `v0.1`
Target release: `v0.2`

## v0.2 Goals
- Stabilize weekly lifecycle so passage continuity is guaranteed without manual intervention.
- Improve real-time collaboration in Reader + Discussion.
- Harden security/ops for Supabase + Vercel production usage.

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
