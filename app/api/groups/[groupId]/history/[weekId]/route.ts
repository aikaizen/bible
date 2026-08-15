import { handleRouteError, ok } from "@/lib/api";
import { getAuthUser } from "@/lib/auth-helpers";
import { getArchivedWeek } from "@/lib/service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ groupId: string; weekId: string }> },
) {
  try {
    const user = await getAuthUser();
    const { groupId, weekId } = await context.params;
    const week = await getArchivedWeek(groupId, weekId, user.id);
    return ok(week);
  } catch (error) {
    return handleRouteError(error);
  }
}
