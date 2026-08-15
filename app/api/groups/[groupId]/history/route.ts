import { handleRouteError, ok } from "@/lib/api";
import { getAuthUser } from "@/lib/auth-helpers";
import { getGroupHistory } from "@/lib/service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ groupId: string }> },
) {
  try {
    const user = await getAuthUser();
    const { groupId } = await context.params;
    const history = await getGroupHistory(groupId, user.id);
    return ok({ history });
  } catch (error) {
    return handleRouteError(error);
  }
}
