import { handleRouteError, ok, badRequest } from "@/lib/api";
import { dbQueryOne } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = (body.email ?? "").trim().toLowerCase();
    const name = (body.name ?? "").trim();

    if (!email) {
      return badRequest("Email is required");
    }

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return badRequest("Invalid email format");
    }

    // Try to find existing user
    const existing = await dbQueryOne<{ id: string; name: string; email: string; default_language: string }>(
      `SELECT id, name, email, default_language FROM users WHERE email = $1`,
      [email],
    );

    if (existing) {
      return ok({
        user: {
          id: existing.id,
          name: existing.name,
          email: existing.email,
          language: existing.default_language,
        },
        isNew: false,
      });
    }

    // Create new user
    if (!name) {
      return badRequest("Name is required for new accounts");
    }

    const created = await dbQueryOne<{ id: string; name: string; email: string; default_language: string }>(
      `INSERT INTO users(name, email, default_language)
       VALUES ($1, $2, 'en')
       RETURNING id, name, email, default_language`,
      [name.slice(0, 60), email],
    );

    if (!created) {
      return badRequest("Failed to create account", 500);
    }

    return ok({
      user: {
        id: created.id,
        name: created.name,
        email: created.email,
        language: created.default_language,
      },
      isNew: true,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
