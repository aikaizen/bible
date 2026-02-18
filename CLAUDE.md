# Bible Vote

A mobile-first web app where groups vote on weekly Bible readings, discuss passages, and track progress together.

## Stack

- **Framework**: Next.js 15 (App Router), React 19
- **Database**: PostgreSQL on [Neon](https://neon.tech), raw `pg` driver (no ORM)
- **Auth**: NextAuth.js v5 (beta) — Google OAuth + discrete admin credentials login
- **Hosting**: Vercel at `bible.promptengines.com`
- **Styling**: Single CSS file (`app/globals.css`), no CSS framework

## Project Structure

```
app/
  page.tsx              # Single-page client app (~1300 lines, all UI)
  layout.tsx            # Root layout with SessionProvider
  providers.tsx         # Client-side SessionProvider wrapper
  globals.css           # All styles
  api/
    auth/[...nextauth]/ # NextAuth route handler
    groups/             # Group CRUD, voting, proposals, settings
    comments/           # Comment CRUD
    reading-items/      # Read marks, comments per reading
    users/              # Groups list, notifications
    bible/              # Bible text API proxy
    bootstrap/          # Initial app data
lib/
  auth.ts               # NextAuth config (Google + Credentials providers)
  auth-helpers.ts       # getAuthUser() for API route protection
  db.ts                 # PostgreSQL pool + query helpers
  service.ts            # Business logic layer
  api.ts                # Route response helpers (ok, badRequest, handleRouteError)
  reference.ts          # Bible reference parsing
  seed-passages.ts      # Seed passage generation
db/
  schema.sql            # Full database schema (idempotent DDL)
scripts/
  migrate.mjs           # Runs schema.sql against DATABASE_URL
  seed.mjs              # Seeds initial data
```

## Auth

- **Google OAuth**: Primary login. Users matched by `google_id` column, with email fallback for migration.
- **Admin login**: Tap "Bible Vote" brand text 5 times on sign-in screen to reveal email/password form. Password verified against `ADMIN_PASSWORD_HASH` env var (SHA-256, timing-safe).
- **Session**: JWT strategy, no DB session table. User's DB `id` embedded in token via `dbId` field.
- **API protection**: All API routes call `getAuthUser()` which reads the NextAuth session server-side. Returns 401 on missing/expired session.

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `NEXT_PUBLIC_APP_URL` | App URL (localhost:3000 for dev) |
| `AUTH_SECRET` | NextAuth JWT signing secret |
| `AUTH_GOOGLE_ID` | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret |
| `AUTH_TRUST_HOST` | Set `true` for Vercel deployment |
| `ADMIN_PASSWORD_HASH` | SHA-256 hash of admin password |

All are set on Vercel for production. See `.env.example` for template.

## Key Patterns

- **No ORM**: Raw SQL via `dbQuery`/`dbQueryOne` in `lib/db.ts`
- **Service layer**: Business logic in `lib/service.ts`, routes are thin wrappers
- **Idempotent schema**: `db/schema.sql` uses `IF NOT EXISTS` everywhere, safe to re-run
- **Single-page client**: All UI in `app/page.tsx` with tab-based navigation
- **Optimistic UI**: Vote updates are applied immediately, reverted on error

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run db:migrate   # Run schema against DATABASE_URL
npm run db:seed      # Seed initial data
vercel --prod --yes  # Deploy to production
```

## Deployment

Domain: `bible.promptengines.com` (DNS: A record `bible` -> `76.76.21.21`)

Google OAuth redirect URIs:
- `http://localhost:3000/api/auth/callback/google`
- `https://bible.promptengines.com/api/auth/callback/google`
