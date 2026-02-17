# TODO - Weekly Bible Reading Companion

## 1. Supabase setup
- [ ] Create Supabase project (or use existing one).
- [ ] Run `db/schema.sql` via Supabase SQL Editor or MCP `apply_migration` tool.
- [ ] (Optional) Run seed data via Supabase SQL Editor or MCP `execute_sql` tool.
- [ ] Copy Supabase project URL and anon key for the app.
- [ ] Set `DATABASE_URL` to Supabase connection string in `.env` (and Vercel).

## 2. Migrate to Supabase JS client
- [ ] Install `@supabase/supabase-js` (replace `pg` dependency).
- [ ] Replace `lib/db.ts` (raw `pg` Pool) with Supabase client using `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Update `lib/service.ts` queries to use Supabase client (or keep raw SQL via `supabase.rpc` / `supabase.from()`).
- [ ] Remove `docker-compose.yml` (no local Postgres needed).
- [ ] Remove `scripts/migrate.mjs` and `scripts/seed.mjs` (use Supabase dashboard/MCP instead).
- [ ] Remove `db:migrate` and `db:seed` scripts from `package.json`.
- [ ] Remove `pg` and `@types/pg` from dependencies.

## 3. Deploy to Vercel
- [ ] Push repo to GitHub.
- [ ] Import into Vercel.
- [ ] Add environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Verify `/api/bootstrap` works in production.

## 4. MVP QA pass (must ship)
- [ ] Join group via invite token.
- [ ] Add proposal with valid reference format.
- [ ] Vote and change vote before close.
- [ ] Confirm auto-resolve after close time behavior.
- [ ] Confirm tie policy behavior (`ADMIN_PICK`, `RANDOM`, `EARLIEST`).
- [ ] Mark reading state (`NOT_MARKED`, `PLANNED`, `READ`).
- [ ] Post comment, post reply (1-level only), delete own comment.
- [ ] Mention user in comment and verify notification.

## 5. Security + production guardrails
- [ ] Add Supabase Auth for real authentication.
- [ ] Enable Row Level Security (RLS) policies on all tables.
- [ ] Remove ability to spoof `userId` in request bodies (use Supabase auth session).
- [ ] Add input rate limiting for comments/proposals/votes.
- [ ] Add server-side logging for API errors.
- [ ] Add basic abuse/spam checks for text input.

## 6. Reliability + operations
- [ ] Add scheduled job for reminders/weekly lifecycle (Supabase Edge Functions + pg_cron).
- [ ] Add health endpoint and DB connectivity check.
- [ ] Use Supabase's built-in backup/PITR (no manual backup plan needed).
- [ ] Add monitoring (Vercel logs + Supabase dashboard).

## 7. Code quality
- [ ] Run `npm install` and verify clean install.
- [ ] Run `npm run lint` and fix issues.
- [ ] Run `npm run build` and fix any build errors.
- [ ] Add API route tests for core flows.
- [ ] Add service-layer tests for vote resolve edge cases.

## 8. Nice-to-have next
- [ ] Add reactions (like/heart).
- [ ] Add ranked choice voting.
- [ ] Add Supabase Realtime for live updates (votes, comments).
- [ ] Add analytics dashboard for weekly engagement.
- [ ] Add export discussion history.
