# Weekly Bible Reading Companion (MVP)

A deployable MVP for group Bible reading coordination with:
- Private groups and invite links
- Weekly proposal + voting flow
- Auto winner resolution on close timer
- Tie policy handling (`ADMIN_PICK`, `RANDOM`, `EARLIEST`)
- Weekly discussion thread with 1-level replies
- Read tracking (`NOT_MARKED`, `PLANNED`, `READ`)
- **Email notifications** with user preferences and unsubscribe
- Notifications for key events

This app stores references only (no scripture text content).

## Stack
- Next.js (App Router + API routes)
- PostgreSQL
- TypeScript

## Supabase + Vercel Deployment
1. Create a Supabase project.
2. In Supabase, open `Project Settings -> Database` and copy the `Connection string` (URI format).
3. Push this repository to GitHub.
4. Import the repo in Vercel.
5. In Vercel project settings, add environment variable:
   - `DATABASE_URL=<your_supabase_connection_string>`
   - `CRON_SECRET=<long_random_secret>`
6. Deploy once.
7. Run migration against Supabase:
```bash
DATABASE_URL=<your_supabase_connection_string> npm run db:migrate
```
8. Optional demo seed:
```bash
DATABASE_URL=<your_supabase_connection_string> npm run db:seed
```
9. Add a Vercel Cron (hourly recommended) for weekly lifecycle automation:
   - Path: `/api/cron/weekly-rollover`
   - Schedule: `0 * * * *`
   - Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` when `CRON_SECRET` is set.

## Local Setup (Optional)
1. Install dependencies
```bash
npm install
```

2. Configure environment
```bash
cp .env.example .env
```
Use either:
- Supabase Postgres URL in `DATABASE_URL`, or
- Any local Postgres instance URL (Docker is optional, not required).

3. Run schema migration
```bash
npm run db:migrate
```

4. Seed demo data
```bash
npm run db:seed
```

5. Start the app
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## API Highlights
- `GET /api/bootstrap`
- `POST /api/groups`
- `GET /api/groups/:groupId/active-week?userId=:userId`
- `POST /api/groups/:groupId/proposals`
- `DELETE /api/groups/:groupId/proposals`
- `POST /api/groups/:groupId/vote`
- `POST /api/groups/:groupId/resolve`
- `GET/POST /api/cron/weekly-rollover`
- `POST /api/groups/:groupId/invites`
- `POST /api/invites/:token/join`
- `GET/POST /api/reading-items/:readingItemId/comments`
- `POST /api/comments/:commentId/reply`
- `PATCH/DELETE /api/comments/:commentId`
- `POST /api/reading-items/:readingItemId/read-mark`
- `GET /api/users/:userId/notifications`
- `GET/PATCH /api/users/:userId/preferences` — Email notification settings
- `POST /api/unsubscribe` — One-click unsubscribe from all emails

## Notes for Supabase
- Use the direct database URL (not anon/service API keys).
- This app uses server-side Postgres access only; Supabase Auth is not wired yet.
- SSL is auto-enabled in `/Users/adilislam/Desktop/Bible App/lib/db.ts` for hosted DB URLs.

## Product Notes vs PRD
- Default vote close is Wednesday 8:00 PM in group timezone.
- If proposals exist but no votes are cast, resolution falls back to a random proposal.
- If there are no proposals, week stays `PENDING_MANUAL` for admin pick.
- Mentions (`@NameNoSpaces`) and replies generate notifications.
- Comment edit window is 5 minutes; delete is always allowed for author.
- Reader zone is always synced to a shared group passage (created immediately for each active week).

## Important
This is an MVP foundation. For production hardening, add:
- Auth provider (JWT/session)
- Rate limiting and spam controls
- Background jobs for scheduled notifications
- Audit logging and analytics

## Email Notifications (NEW)

The app now sends email notifications via Resend (3000 free emails/month).

### Features
- **Voting opens** — When a new week starts
- **Voting reminder** — Before voting closes  
- **Winner selected** — When the weekly reading is chosen
- **Comment replies** — When someone replies to your comment
- **Mentions** — When you're @mentioned in a discussion
- **User preferences** — Toggle each email type in profile "Email Settings"
- **One-click unsubscribe** — Link in every email footer

### API Endpoints Added
- `GET/PATCH /api/users/:userId/preferences` — Email notification settings
- `POST /api/unsubscribe` — Unsubscribe from all emails

### What You Need to Provide
1. **Resend API Key** — Sign up at https://resend.com (free tier: 3000 emails/month)
2. **From Email Address** — Where emails come from (e.g., `notifications@bibleapp.com`)
3. **Domain** — Your production domain for unsubscribe links

### Environment Variables
```
RESEND_API_KEY=<your_resend_api_key>
EMAIL_FROM=notifications@yourdomain.com
EMAIL_FROM_NAME=Bible Reading Companion
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

### Database Migration Required
Run this SQL against your database (already in `db/migrations/005_add_notification_preferences.sql`):
```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS notify_email_voting BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_email_reminder BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_email_winner BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_email_comments BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_email_mentions BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS unsubscribe_token UUID DEFAULT gen_random_uuid();
```

Or use: `npm run db:migrate`

### Testing
1. Add environment variables to Vercel/local .env
2. Run the database migration
3. Trigger a notification (create a comment reply to yourself)
4. Check email delivery in Resend dashboard
5. Test unsubscribe link and preferences page
