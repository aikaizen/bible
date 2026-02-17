# Google OAuth Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace email-only login with Google OAuth via NextAuth.js v5 so users authenticate securely with their Google account.

**Architecture:** NextAuth.js v5 handles the full OAuth flow with JWT sessions (no DB session table). On sign-in, the `signIn` callback upserts into the existing `users` table, matching by `google_id` or falling back to `email` for migrating existing users. API routes read the session server-side instead of trusting client-passed `userId`.

**Tech Stack:** Next.js 15 (App Router), NextAuth.js v5 (`next-auth@5`), PostgreSQL (Neon, raw `pg` driver), React 19.

---

### Task 1: Install next-auth and add environment variables

**Files:**
- Modify: `package.json`
- Modify: `.env`
- Create: `.env.example`

**Step 1: Install next-auth**

Run: `npm install next-auth@5`

**Step 2: Add environment variables to `.env`**

Add these lines to the existing `.env` file (keep existing `DATABASE_URL` and `NEXT_PUBLIC_APP_URL`):

```
AUTH_SECRET=<generate with `npx auth secret`>
AUTH_GOOGLE_ID=<from Google Cloud Console>
AUTH_GOOGLE_SECRET=<from Google Cloud Console>
```

Note: NextAuth v5 uses `AUTH_` prefix by convention. `AUTH_SECRET` replaces the old `NEXTAUTH_SECRET`. `AUTH_URL` is auto-detected on Vercel.

**Step 3: Create `.env.example`**

```
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
NEXT_PUBLIC_APP_URL=http://localhost:3000
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
```

**Step 4: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "feat: install next-auth v5 and add env template"
```

---

### Task 2: Add `google_id` column to the database schema

**Files:**
- Modify: `db/schema.sql`

**Step 1: Add migration SQL to `db/schema.sql`**

Append this block at the end of the file:

```sql
-- Google OAuth: stable account linking via Google sub ID
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'google_id'
  ) THEN
    ALTER TABLE users ADD COLUMN google_id TEXT UNIQUE;
  END IF;
END
$$;
```

**Step 2: Run the migration against Neon**

Run: `npm run db:migrate`

Expected: Migration applies without error. The `users` table now has a `google_id` column.

**Step 3: Commit**

```bash
git add db/schema.sql
git commit -m "feat: add google_id column to users table"
```

---

### Task 3: Create NextAuth config (`lib/auth.ts`)

**Files:**
- Create: `lib/auth.ts`

**Step 1: Create `lib/auth.ts`**

```typescript
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

import { dbQueryOne } from "./db";

declare module "next-auth" {
  interface User {
    dbId?: string;
  }
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    dbId?: string;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "google" || !user.email) return false;

      const googleId = account.providerAccountId;
      const name = user.name ?? user.email.split("@")[0];

      // Try matching by google_id first
      const byGoogleId = await dbQueryOne<{ id: string }>(
        `SELECT id FROM users WHERE google_id = $1`,
        [googleId],
      );

      if (byGoogleId) {
        user.dbId = byGoogleId.id;
        return true;
      }

      // Fall back to email match (migrates existing users)
      const byEmail = await dbQueryOne<{ id: string }>(
        `SELECT id FROM users WHERE email = $1`,
        [user.email.toLowerCase()],
      );

      if (byEmail) {
        // Link google_id to existing account
        await dbQueryOne(
          `UPDATE users SET google_id = $1 WHERE id = $2 RETURNING id`,
          [googleId, byEmail.id],
        );
        user.dbId = byEmail.id;
        return true;
      }

      // New user — create account
      const created = await dbQueryOne<{ id: string }>(
        `INSERT INTO users(name, email, google_id, default_language)
         VALUES ($1, $2, $3, 'en')
         RETURNING id`,
        [name.slice(0, 60), user.email.toLowerCase(), googleId],
      );

      if (!created) return false;
      user.dbId = created.id;
      return true;
    },

    async jwt({ token, user }) {
      if (user?.dbId) {
        token.dbId = user.dbId;
      }
      return token;
    },

    async session({ session, token }) {
      if (token.dbId) {
        session.user.id = token.dbId;
      }
      return session;
    },
  },
});
```

**Step 2: Commit**

```bash
git add lib/auth.ts
git commit -m "feat: add NextAuth config with Google provider and user upsert"
```

---

### Task 4: Create NextAuth API route handler

**Files:**
- Create: `app/api/auth/[...nextauth]/route.ts`
- Delete: `app/api/auth/login/route.ts` (old email-only login)

**Step 1: Create `app/api/auth/[...nextauth]/route.ts`**

```typescript
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
```

**Step 2: Delete the old login route**

Delete `app/api/auth/login/route.ts` — it's replaced by NextAuth's Google flow.

**Step 3: Commit**

```bash
git add app/api/auth/\[...nextauth\]/route.ts
git rm app/api/auth/login/route.ts
git commit -m "feat: add NextAuth catch-all route, remove old email login"
```

---

### Task 5: Create `getAuthUser()` helper for API routes

**Files:**
- Create: `lib/auth-helpers.ts`

**Step 1: Create `lib/auth-helpers.ts`**

This helper extracts the authenticated user's DB ID from the NextAuth session. API routes call this instead of trusting `userId` from the request body.

```typescript
import { auth } from "./auth";

export async function getAuthUser(): Promise<{ id: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  return { id: session.user.id };
}
```

**Step 2: Commit**

```bash
git add lib/auth-helpers.ts
git commit -m "feat: add getAuthUser helper for server-side auth"
```

---

### Task 6: Update API routes to use server-side auth

**Files:**
- Modify: `app/api/groups/[groupId]/vote/route.ts`
- Modify: `app/api/groups/[groupId]/proposals/route.ts`
- Modify: `app/api/groups/[groupId]/active-week/route.ts`
- Modify: `app/api/groups/[groupId]/resolve/route.ts`
- Modify: `app/api/groups/[groupId]/invites/route.ts`
- Modify: `app/api/groups/[groupId]/settings/route.ts`
- Modify: `app/api/groups/[groupId]/new-vote/route.ts`
- Modify: `app/api/groups/[groupId]/proposals/reroll/route.ts`
- Modify: `app/api/groups/route.ts`
- Modify: `app/api/invites/[token]/join/route.ts`
- Modify: `app/api/reading-items/[readingItemId]/comments/route.ts`
- Modify: `app/api/reading-items/[readingItemId]/read-mark/route.ts`
- Modify: `app/api/comments/[commentId]/route.ts`
- Modify: `app/api/comments/[commentId]/reply/route.ts`
- Modify: `app/api/users/[userId]/notifications/route.ts`
- Modify: `app/api/users/[userId]/groups/route.ts`
- Modify: `app/api/bootstrap/route.ts`

**Pattern:** In each route, replace reading `userId` from request body/query with:

```typescript
import { getAuthUser } from "@/lib/auth-helpers";

// Inside the handler:
const user = await getAuthUser();
const userId = user.id;
```

For POST/PUT/DELETE routes, remove `userId` from the request body parsing.
For GET routes (like `active-week`), remove `userId` from query params.

**Step 1: Update each API route file**

Apply the pattern above to every route. The `userId` variable should come from `getAuthUser()` instead of the request.

For the `users/[userId]/*` routes, validate that `params.userId` matches `user.id` (or remove the URL param and use the session user).

For `bootstrap/route.ts`, it no longer needs to return a users list — just return `{ now }`.

**Step 2: Verify build**

Run: `npm run build`

Expected: Build succeeds with no TypeScript errors.

**Step 3: Commit**

```bash
git add app/api/
git commit -m "feat: secure all API routes with server-side NextAuth session"
```

---

### Task 7: Update the client (`app/page.tsx`)

**Files:**
- Modify: `app/page.tsx`

**Step 1: Replace auth screen with Google sign-in**

At the top of the file, add the import:

```typescript
import { signIn, signOut, useSession } from "next-auth/react";
```

Remove these state variables that are no longer needed:
- `authMode`, `authEmail`, `authName`, `authError`
- `isAuthenticated`, `selectedUserId` (derive from session instead)

Replace the `useEffect` bootstrap logic:
- Use `useSession()` to get the session
- If `session?.user?.id` exists, the user is authenticated
- The user ID comes from `session.user.id` instead of localStorage

Replace the auth screen (lines ~651-704) with:

```tsx
if (!session) {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">Bible Vote</div>
        <div className="auth-subtitle">Vote on weekly Bible readings with your group</div>
        <button
          className="btn btn-gold auth-btn"
          onClick={() => signIn("google")}
          style={{ marginTop: 24 }}
          type="button"
        >
          Sign in with Google
        </button>
      </div>
    </div>
  );
}
```

Replace the sign-out function:

```typescript
function onSignOut() {
  window.localStorage.removeItem("bible-app-group-id");
  signOut();
}
```

Remove `userId` from all `api()` calls — the server reads it from the session now. Specifically:
- Remove `userId` from POST bodies in `onVote`, `onCreateProposal`, `onResolve`, `onReadMark`, `onCreateComment`, `onDeleteComment`, `onJoinInvite`, `onCreateGroup`, `onCreateInvite`, `onReroll`, `onStartNewVote`, `onUpdateSettings`
- Remove `?userId=...` from GET URLs in `loadSnapshot`, `loadUserGroups`
- Replace `ownerId: selectedUserId` with nothing (server reads from session)

**Step 2: Wrap the app with SessionProvider**

Modify `app/layout.tsx` to wrap children with NextAuth's `SessionProvider`:

```tsx
import { SessionProvider } from "next-auth/react";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
```

Since `layout.tsx` is a Server Component, and `SessionProvider` is a client component, create a small wrapper:

Create `app/providers.tsx`:

```tsx
"use client";

import { SessionProvider } from "next-auth/react";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
```

Then in `layout.tsx`:

```tsx
import Providers from "./providers";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

**Step 3: Verify build**

Run: `npm run build`

Expected: Build succeeds.

**Step 4: Commit**

```bash
git add app/page.tsx app/layout.tsx app/providers.tsx
git commit -m "feat: replace email login with Google OAuth on client"
```

---

### Task 8: Set up Google Cloud OAuth credentials

This is a manual step the developer must do in the browser.

**Step 1: Go to Google Cloud Console**

1. Go to https://console.cloud.google.com/
2. Create a new project (or use existing)
3. Go to APIs & Services > Credentials
4. Click "Create Credentials" > "OAuth client ID"
5. Application type: "Web application"
6. Authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (dev)
   - `https://bible-app-swart.vercel.app/api/auth/callback/google` (prod)
7. Copy the Client ID and Client Secret

**Step 2: Set the env vars locally**

Update `.env`:
```
AUTH_GOOGLE_ID=<paste client id>
AUTH_GOOGLE_SECRET=<paste client secret>
AUTH_SECRET=<run `npx auth secret` and paste>
```

**Step 3: Set env vars on Vercel**

Run:
```bash
vercel env add AUTH_SECRET
vercel env add AUTH_GOOGLE_ID
vercel env add AUTH_GOOGLE_SECRET
```

Or set them in the Vercel dashboard under Project Settings > Environment Variables.

---

### Task 9: Test locally and deploy

**Step 1: Run dev server**

Run: `npm run dev`

**Step 2: Test the flow**

1. Open http://localhost:3000
2. See "Sign in with Google" button
3. Click it — redirected to Google
4. Authorize — redirected back, session created
5. App loads groups, snapshot, etc.
6. Sign out works

**Step 3: Deploy**

Run: `vercel --prod --yes`

**Step 4: Test production**

1. Open https://bible-app-swart.vercel.app
2. Sign in with Google
3. Verify existing user data is preserved (email match migration)

**Step 5: Final commit (if any tweaks)**

```bash
git add -A
git commit -m "chore: final OAuth tweaks after testing"
```
