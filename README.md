# Weekly Bible Reading Companion (MVP)

A deployable MVP for group Bible reading coordination with:
- Private groups and invite links
- Weekly proposal + voting flow
- Auto winner resolution on close timer
- Tie policy handling (`ADMIN_PICK`, `RANDOM`, `EARLIEST`)
- Weekly discussion thread with 1-level replies
- Read tracking (`NOT_MARKED`, `PLANNED`, `READ`)
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
6. Deploy once.
7. Run migration against Supabase:
```bash
DATABASE_URL=<your_supabase_connection_string> npm run db:migrate
```
8. Optional demo seed:
```bash
DATABASE_URL=<your_supabase_connection_string> npm run db:seed
```

## Local Setup (Optional)
1. Install dependencies
```bash
npm install
```

2. Start PostgreSQL
```bash
docker compose up -d db
```

3. Configure environment
```bash
cp .env.example .env
```

4. Run schema migration
```bash
npm run db:migrate
```

5. Seed demo data
```bash
npm run db:seed
```

6. Start the app
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
- `POST /api/groups/:groupId/invites`
- `POST /api/invites/:token/join`
- `GET/POST /api/reading-items/:readingItemId/comments`
- `POST /api/comments/:commentId/reply`
- `PATCH/DELETE /api/comments/:commentId`
- `POST /api/reading-items/:readingItemId/read-mark`
- `GET /api/users/:userId/notifications`

## Notes for Supabase
- Use the direct database URL (not anon/service API keys).
- This app uses server-side Postgres access only; Supabase Auth is not wired yet.
- SSL is auto-enabled in `/Users/adilislam/Desktop/Bible App/lib/db.ts` for hosted DB URLs.

## Product Notes vs PRD
- Default vote close is Wednesday 8:00 PM in group timezone.
- If no votes or no proposals, week stays `PENDING_MANUAL` for admin pick.
- Mentions (`@NameNoSpaces`) and replies generate notifications.
- Comment edit window is 5 minutes; delete is always allowed for author.

## Important
This is an MVP foundation. For production hardening, add:
- Auth provider (JWT/session)
- Rate limiting and spam controls
- Background jobs for scheduled notifications
- Audit logging and analytics
