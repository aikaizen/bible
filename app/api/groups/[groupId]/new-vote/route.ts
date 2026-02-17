import { badRequest, handleRouteError, ok, parseBody } from "@/lib/api";
import { startNewVote } from "@/lib/service";

type NewVoteBody = {
  userId: string;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ groupId: string }> },
) {
  try {
    const { groupId } = await context.params;
    const body = await parseBody<NewVoteBody>(request);

    if (!body.userId) {
      return badRequest("userId is required", 422);
    }

    const data = await startNewVote({ groupId, userId: body.userId });
    return ok(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
