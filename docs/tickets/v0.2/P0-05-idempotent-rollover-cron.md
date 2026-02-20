# P0-05: Idempotent Weekly Rollover Job

## Summary
Add a protected cron endpoint to run lifecycle rollover for all groups without requiring active clients.

## Problem
Lifecycle progression currently relies heavily on user traffic.

## Scope
- Add service function to run rollover across groups.
- Add API cron route guarded by `CRON_SECRET`.
- Ensure operation is idempotent and safe to run repeatedly.

## Acceptance Criteria
- Endpoint returns processed group count.
- Repeated calls do not create duplicate active weeks.
- Route rejects unauthorized requests.

## Files
- `lib/service.ts`
- `app/api/cron/weekly-rollover/route.ts`
- `.env.example`
- `README.md`
