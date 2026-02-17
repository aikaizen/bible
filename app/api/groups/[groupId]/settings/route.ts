import { badRequest, handleRouteError, ok, parseBody } from "@/lib/api";
import { updateGroupSettings } from "@/lib/service";

type SettingsBody = {
  userId: string;
  votingDurationHours?: number;
  tiePolicy?: "ADMIN_PICK" | "RANDOM" | "EARLIEST";
  liveTally?: boolean;
};

export async function PUT(
  request: Request,
  context: { params: Promise<{ groupId: string }> },
) {
  try {
    const { groupId } = await context.params;
    const body = await parseBody<SettingsBody>(request);

    if (!body.userId) {
      return badRequest("userId is required", 422);
    }

    const data = await updateGroupSettings({
      groupId,
      userId: body.userId,
      votingDurationHours: body.votingDurationHours,
      tiePolicy: body.tiePolicy,
      liveTally: body.liveTally,
    });

    return ok(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
