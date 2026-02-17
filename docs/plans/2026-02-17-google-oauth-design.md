# Google OAuth with NextAuth.js

## Context

The app currently has email-only login with no passwords, sessions, or tokens. Auth state is stored client-side. We're adding Google OAuth via NextAuth.js v5 to provide real authentication.

**Stack**: Next.js 15 (App Router), React 19, PostgreSQL (Neon), raw `pg` driver.

## Design

### Flow

1. User clicks "Sign in with Google" -> Google consent screen
2. Google redirects back with auth code -> NextAuth exchanges for tokens
3. NextAuth creates a JWT session cookie (no DB session table)
4. On sign-in, upsert into `users` table (match by `google_id`, fall back to `email` for migration)

### Schema Change

Add `google_id TEXT UNIQUE` column to `users` table. Google ID is stable (email can change).

### New/Modified Files

- `lib/auth.ts` — NextAuth config (Google provider, signIn/jwt/session callbacks)
- `app/api/auth/[...nextauth]/route.ts` — NextAuth catch-all route handler
- `lib/auth-helpers.ts` — `getAuthUser()` helper for API route protection
- `app/page.tsx` — Replace email login form with "Sign in with Google" button
- `db/schema.sql` — Add `google_id` column migration
- API routes — Replace client-passed `userId` with server-side `getAuthUser()`

### Callbacks

- **signIn**: Upsert user (google_id first, then email fallback). Set `google_id` on existing email-matched users.
- **jwt**: Embed app `user.id` into JWT token.
- **session**: Expose `user.id`, `user.name`, `user.email` to client.

### Migration

Existing users who sign in with Google using their same email get linked automatically via email match. Their `google_id` is set on first Google login. No data loss.

### Environment Variables

- `GOOGLE_CLIENT_ID` — Google Cloud Console
- `GOOGLE_CLIENT_SECRET` — Google Cloud Console
- `NEXTAUTH_SECRET` — Random string for JWT signing
- `NEXTAUTH_URL` — App URL (auto-detected on Vercel)

### What Stays the Same

- `users` table structure (only adds `google_id`)
- All existing API routes (gain real auth)
- Database provider (Neon PostgreSQL, raw `pg`)
