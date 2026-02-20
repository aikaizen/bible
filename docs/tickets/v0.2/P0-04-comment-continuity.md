# P0-04: Comment Continuity Across Vote Transitions

## Summary
Ensure comments remain accessible through week transitions and new vote rounds.

## Problem
Discussion must remain available while shared reading updates across lifecycle transitions.

## Scope
- Add tests verifying:
  - Comments remain queryable for previous reading item after new vote round starts.
  - Active reading for new round still supports comments.

## Acceptance Criteria
- Tests confirm old-thread readability and new-thread availability.
- No lifecycle path produces a null/invalid discussion target when proposals exist.

## Files
- `tests/service.comments-continuity.test.ts`
