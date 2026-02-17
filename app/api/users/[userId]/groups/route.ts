import { handleRouteError, ok } from "@/lib/api";
import { getAuthUser } from "@/lib/auth-helpers";
import { getUserGroups } from "@/lib/service";

export async function GET() {
  try {
    const user = await getAuthUser();
    const rows = await getUserGroups(user.id);
    const groups = rows.map((row) => ({
      id: row.id,
      name: row.name,
      timezone: row.timezone,
      role: row.role,
      inviteToken: row.invite_token,
    }));
    return ok({ groups });
  } catch (error) {
    return handleRouteError(error);
  }
}
