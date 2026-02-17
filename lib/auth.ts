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

declare module "@auth/core/jwt" {
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
