import { handleRouteError, ok, parseBody } from "@/lib/api";
import { getAuthUser } from "@/lib/auth-helpers";
import { createInvite } from "@/lib/service";

type InviteBody = {
  expiresInDays?: number;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ groupId: string }> },
) {
  try {
    const user = await getAuthUser();
    const { groupId } = await context.params;
    const body = await parseBody<InviteBody>(request);

    const data = await createInvite({
      groupId,
      userId: user.id,
      expiresInDays: body.expiresInDays,
    });

    return ok(data, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
