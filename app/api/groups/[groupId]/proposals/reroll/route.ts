import { badRequest, handleRouteError, ok, parseBody } from "@/lib/api";
import { getAuthUser } from "@/lib/auth-helpers";
import { rerollSeedProposal } from "@/lib/service";

type RerollBody = {
  proposalId: string;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ groupId: string }> },
) {
  try {
    const user = await getAuthUser();
    const { groupId } = await context.params;
    const body = await parseBody<RerollBody>(request);

    if (!body.proposalId) {
      return badRequest("proposalId is required", 422);
    }

    const data = await rerollSeedProposal({ groupId, userId: user.id, proposalId: body.proposalId });
    return ok(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
