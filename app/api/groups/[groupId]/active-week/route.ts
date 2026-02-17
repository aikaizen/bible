import { handleRouteError, ok } from "@/lib/api";
import { getAuthUser } from "@/lib/auth-helpers";
import { getGroupSnapshot } from "@/lib/service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ groupId: string }> },
) {
  try {
    const user = await getAuthUser();
    const { groupId } = await context.params;

    const snapshot = await getGroupSnapshot(groupId, user.id);
    return ok(snapshot);
  } catch (error) {
    return handleRouteError(error);
  }
}
