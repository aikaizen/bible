# P0-03: Concurrency Protection Tests

## Summary
Add tests for simultaneous vote/resolve operations to protect against duplicate or inconsistent reading resolution.

## Problem
Concurrent requests (multiple members voting + admin resolving) can produce race conditions.

## Scope
- Simulate concurrent calls to `castVote()` and `resolveCurrentWeek()`.
- Assert single resolved reading and no duplicated active readings.

## Acceptance Criteria
- Concurrent test passes consistently.
- Active week resolves once with one shared reading item.

## Files
- `tests/service.concurrency.test.ts`
