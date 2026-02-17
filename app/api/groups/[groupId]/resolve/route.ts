import { handleRouteError, ok, parseBody } from "@/lib/api";
import { getAuthUser } from "@/lib/auth-helpers";
import { resolveCurrentWeek } from "@/lib/service";

type ResolveBody = {
  proposalId?: string;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ groupId: string }> },
) {
  try {
    const user = await getAuthUser();
    const { groupId } = await context.params;
    const body = await parseBody<ResolveBody>(request);

    const data = await resolveCurrentWeek(groupId, user.id, body.proposalId);
    return ok(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
