import { handleRouteError, ok, parseBody } from "@/lib/api";
import { getAuthUser } from "@/lib/auth-helpers";
import { updateGroupSettings } from "@/lib/service";

type SettingsBody = {
  votingDurationHours?: number;
  tiePolicy?: "ADMIN_PICK" | "RANDOM" | "EARLIEST";
  liveTally?: boolean;
};

export async function PUT(
  request: Request,
  context: { params: Promise<{ groupId: string }> },
) {
  try {
    const user = await getAuthUser();
    const { groupId } = await context.params;
    const body = await parseBody<SettingsBody>(request);

    const data = await updateGroupSettings({
      groupId,
      userId: user.id,
      votingDurationHours: body.votingDurationHours,
      tiePolicy: body.tiePolicy,
      liveTally: body.liveTally,
    });

    return ok(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
