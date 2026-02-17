import { badRequest, handleRouteError, ok, parseBody } from "@/lib/api";
import { joinGroupByInvite } from "@/lib/service";

type JoinBody = {
  userId: string;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const body = await parseBody<JoinBody>(request);

    if (!body.userId) {
      return badRequest("userId is required", 422);
    }

    const data = await joinGroupByInvite({ token, userId: body.userId });
    return ok(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
