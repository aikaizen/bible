# P0-02: Deterministic Random Fallback Tests

## Summary
Make random fallback behavior testable and deterministic.

## Problem
Random winner fallback behavior cannot be reliably asserted in tests when randomness is hard-coded.

## Scope
- Add test-only random source injection for service random selection.
- Add tests for no-vote fallback and random proposal pick behavior.

## Acceptance Criteria
- Service exposes test-only random hook/reset.
- Tests can force first/last proposal selection deterministically.
- No production behavior change when hooks are not used.

## Files
- `lib/service.ts`
- `tests/service.random-fallback.test.ts`
