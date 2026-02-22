import { handleRouteError, ok } from "@/lib/api";
import { getInviteByToken } from "@/lib/service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const invite = await getInviteByToken(token);

    if (!invite) {
      return ok({ valid: false }, 404);
    }

    return ok({
      valid: true,
      groupName: invite.group_name,
      invitedBy: invite.creator_name,
      recipientName: invite.recipient_name,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
