import { handleRouteError, ok, parseBody } from "@/lib/api";
import { getAuthUser } from "@/lib/auth-helpers";
import { removeMember } from "@/lib/service";

type RemoveMemberBody = {
  targetUserId: string;
};

export async function DELETE(
  request: Request,
  context: { params: Promise<{ groupId: string }> },
) {
  try {
    const user = await getAuthUser();
    const { groupId } = await context.params;
    const body = await parseBody<RemoveMemberBody>(request);

    const data = await removeMember({
      groupId,
      userId: user.id,
      targetUserId: body.targetUserId,
    });

    return ok(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
