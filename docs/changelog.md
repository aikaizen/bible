# Changelog

All notable changes to this project are documented here.

## [0.2.0] - In Progress

### Added
- Weekly rollover cron API at `/api/cron/weekly-rollover` with `CRON_SECRET` authentication.
- `vercel.json` cron schedule to keep week lifecycle advancing without client traffic.
- Vitest + `pg-mem` test harness and P0 reliability coverage:
  - lifecycle integration (create -> vote -> resolve -> new round)
  - deterministic random fallback
  - concurrency/idempotency scenarios
  - comment continuity across vote rounds

### Changed
- Tie policy `RANDOM` now uses the shared testable random source for deterministic behavior in tests.
- Deployment docs now include Supabase + Vercel cron configuration and required env vars.

## [0.1.0] - 2026-02-20

### Added
- Group-based weekly Bible reading workflow with invites and member roles.
- Weekly voting rounds with proposals, single-vote-per-user, and vote changes before close.
- Seed passage generation and admin seed reroll support.
- Reader zone with a shared group passage, read-state tracking, and inline Bible text fetch.
- Discussion threads with 1-level replies, mentions, edit/delete windows, and notifications.
- Group settings for vote duration, tie policy, and live tally behavior.
- OAuth-based auth flow (Google) plus admin access path.
- API surface for voting, resolving, comments, read marks, invites, groups, and notifications.

### Changed
- Weekly reading behavior now guarantees a synced passage for the group during active weeks.
- New weeks immediately get a default reading chosen from the current proposal selection.
- Week resolution fallback now picks a random proposal when proposals exist but votes do not produce a clear winner.

### Fixed
- Reader zone no longer depends on manual resolution to have an active passage.
- Proposal mutations (delete/reroll/new vote round) now keep current reading valid.
- Voting can update the shared reading early when there is a clear leader.

### Notes
- Version `v0.1` is considered feature-complete for initial internal MVP usage.
- Production hardening and reliability tasks are planned for `v0.2`.
