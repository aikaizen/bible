import { badRequest, handleRouteError, ok, parseBody } from "@/lib/api";
import { getAuthUser } from "@/lib/auth-helpers";
import { addMemberToGroup, changeMemberRole, removeMember } from "@/lib/service";
import type { GroupRole } from "@/lib/service";

type AddMemberBody = {
  targetUserId: string;
  role?: GroupRole;
};

type ChangeRoleBody = {
  targetUserId: string;
  newRole: GroupRole;
};

type RemoveMemberBody = {
  targetUserId: string;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ groupId: string }> },
) {
  try {
    const user = await getAuthUser();
    if (!user.isSuperAdmin) return badRequest("Super admin access required", 403);
    const { groupId } = await context.params;
    const body = await parseBody<AddMemberBody>(request);

    const data = await addMemberToGroup({
      groupId,
      targetUserId: body.targetUserId,
      role: body.role,
      actorUserId: user.id,
      isSuperAdmin: true,
    });

    return ok(data);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ groupId: string }> },
) {
  try {
    const user = await getAuthUser();
    if (!user.isSuperAdmin) return badRequest("Super admin access required", 403);
    const { groupId } = await context.params;
    const body = await parseBody<ChangeRoleBody>(request);

    const data = await changeMemberRole({
      groupId,
      targetUserId: body.targetUserId,
      newRole: body.newRole,
      actorUserId: user.id,
      isSuperAdmin: true,
    });

    return ok(data);
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
    const body = await parseBody<RemoveMemberBody>(request);

    const data = await removeMember({
      groupId,
      userId: user.id,
      targetUserId: body.targetUserId,
      isSuperAdmin: user.isSuperAdmin,
    });

    return ok(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
