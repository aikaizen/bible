import { badRequest, handleRouteError, ok, parseBody } from "@/lib/api";
import { createInvite } from "@/lib/service";

type InviteBody = {
  userId: string;
  expiresInDays?: number;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ groupId: string }> },
) {
  try {
    const { groupId } = await context.params;
    const body = await parseBody<InviteBody>(request);

    if (!body.userId) {
      return badRequest("userId is required", 422);
    }

    const data = await createInvite({
      groupId,
      userId: body.userId,
      expiresInDays: body.expiresInDays,
    });

    return ok(data, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
