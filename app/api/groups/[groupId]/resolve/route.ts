import { badRequest, handleRouteError, ok, parseBody } from "@/lib/api";
import { resolveCurrentWeek } from "@/lib/service";

type ResolveBody = {
  userId: string;
  proposalId?: string;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ groupId: string }> },
) {
  try {
    const { groupId } = await context.params;
    const body = await parseBody<ResolveBody>(request);

    if (!body.userId) {
      return badRequest("userId is required", 422);
    }

    const data = await resolveCurrentWeek(groupId, body.userId, body.proposalId);
    return ok(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
