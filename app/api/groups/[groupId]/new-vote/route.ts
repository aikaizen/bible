import { handleRouteError, ok } from "@/lib/api";
import { getAuthUser } from "@/lib/auth-helpers";
import { startNewVote } from "@/lib/service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ groupId: string }> },
) {
  try {
    const user = await getAuthUser();
    const { groupId } = await context.params;

    const data = await startNewVote({ groupId, userId: user.id });
    return ok(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
