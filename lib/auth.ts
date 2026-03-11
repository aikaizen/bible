import crypto from "node:crypto";
import bcrypt from "bcryptjs";

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
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

function verifyAdminPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD_HASH;
  if (!expected) return false;

  // Support bcrypt hashes for secure password storage.
  if (/^\$2[aby]\$\d{2}\$/.test(expected)) {
    return bcrypt.compareSync(input, expected);
  }

  // Backward compatibility for existing SHA-256 env values.
  if (/^[a-f0-9]{64}$/i.test(expected)) {
    const inputHash = crypto.createHash("sha256").update(input).digest("hex");
    try {
      return crypto.timingSafeEqual(
        Buffer.from(inputHash, "hex"),
        Buffer.from(expected, "hex"),
      );
    } catch {
      return false;
    }
  }

  return false;
}

async function upsertUserByEmail(email: string, name: string): Promise<string | null> {
  const existing = await dbQueryOne<{ id: string }>(
    `SELECT id FROM users WHERE email = $1`,
    [email.toLowerCase()],
  );
  if (existing) return existing.id;

  const created = await dbQueryOne<{ id: string }>(
    `INSERT INTO users(name, email, default_language)
     VALUES ($1, $2, 'en')
     RETURNING id`,
    [name.slice(0, 60), email.toLowerCase()],
  );
  return created?.id ?? null;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google,
    Credentials({
      id: "admin",
      name: "Admin",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === "string" ? credentials.email.trim() : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        if (!email || !password) return null;
        if (!verifyAdminPassword(password)) return null;

        const dbId = await upsertUserByEmail(email, email.split("@")[0]);
        if (!dbId) return null;
        // Flag as superadmin on admin-credentials login
        await dbQueryOne(
          `UPDATE users SET is_superadmin = TRUE WHERE id = $1 RETURNING id`,
          [dbId],
        );
        return { id: dbId, dbId, email, name: email.split("@")[0] };
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user, account }) {
      // Credentials provider already handled auth in authorize()
      if (account?.provider === "admin") return true;

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
