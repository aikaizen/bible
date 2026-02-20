# P0-01: Lifecycle Integration Tests

## Summary
Add integration-level test coverage for weekly lifecycle behavior: week creation, vote casting, auto-resolve, and new vote round creation.

## Problem
Core lifecycle behavior currently depends on runtime interactions. Regressions can silently break passage continuity and group sync.

## Scope
- Service-level tests for:
  - `getGroupSnapshot()` creates/loads active week and synced reading.
  - `castVote()` updates votes and can trigger auto-resolve.
  - `resolveCurrentWeek()` finalizes week correctly.
  - `startNewVote()` opens a new round with a valid shared reading.

## Acceptance Criteria
- Tests run in CI and locally via `npm run test`.
- At least one end-to-end service test covers full flow from open week to new vote round.
- Assertions include reading sync invariants (`reading_items` exists for active week).

## Implementation Notes
- Use isolated test DB harness per test file.
- Keep test data fixtures minimal and deterministic.

## Files
- `tests/service.lifecycle.test.ts`
- `tests/helpers/test-db.ts`
- `package.json` (test script)
