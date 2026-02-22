import { handleRouteError, ok, parseBody } from "@/lib/api";
import { getAuthUser } from "@/lib/auth-helpers";
import { createInvite, createPersonalInvite, getPendingInvites, cancelInvite } from "@/lib/service";

type InviteBody = {
  expiresInDays?: number;
  recipientName?: string;
  recipientContact?: string;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ groupId: string }> },
) {
  try {
    const user = await getAuthUser();
    const { groupId } = await context.params;
    const body = await parseBody<InviteBody>(request);

    // Personal invite (with recipient info)
    if (body.recipientName) {
      const data = await createPersonalInvite({
        groupId,
        userId: user.id,
        recipientName: body.recipientName,
        recipientContact: body.recipientContact,
      });
      return ok(data, 201);
    }

    // Generic invite (admin only, existing behavior)
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

export async function GET(
  _request: Request,
  context: { params: Promise<{ groupId: string }> },
) {
  try {
    const user = await getAuthUser();
    const { groupId } = await context.params;
    const invites = await getPendingInvites(groupId, user.id);
    return ok({ invites });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ groupId: string }> },
) {
  try {
    const user = await getAuthUser();
    const { groupId } = await context.params;
    const body = await parseBody<{ inviteId: string }>(request);
    const data = await cancelInvite({ inviteId: body.inviteId, groupId, userId: user.id });
    return ok(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
