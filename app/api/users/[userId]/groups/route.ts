import { handleRouteError, ok } from "@/lib/api";
import { getUserGroups } from "@/lib/service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  try {
    const { userId } = await context.params;
    const rows = await getUserGroups(userId);
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
