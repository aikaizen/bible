import { badRequest, handleRouteError, ok, parseBody } from "@/lib/api";
import { castVote } from "@/lib/service";

type VoteBody = {
  userId: string;
  proposalId: string;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ groupId: string }> },
) {
  try {
    const { groupId } = await context.params;
    const body = await parseBody<VoteBody>(request);

    if (!body.userId || !body.proposalId) {
      return badRequest("userId and proposalId are required", 422);
    }

    const data = await castVote({ groupId, userId: body.userId, proposalId: body.proposalId });
    return ok(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
