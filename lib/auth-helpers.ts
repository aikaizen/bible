import { auth } from "./auth";
import { dbQueryOne } from "./db";

export async function getAuthUser(): Promise<{ id: string; isSuperAdmin: boolean }> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  const user = await dbQueryOne<{ is_superadmin: boolean }>(
    `SELECT is_superadmin FROM users WHERE id = $1`,
    [session.user.id],
  );
  return { id: session.user.id, isSuperAdmin: user?.is_superadmin ?? false };
}
