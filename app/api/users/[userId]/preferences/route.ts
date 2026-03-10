import { handleRouteError, ok, badRequest, parseBody } from "@/lib/api";
import { getAuthUser } from "@/lib/auth-helpers";
import { getUserPreferences, updateUserPreferences } from "@/lib/service";

interface PreferencesBody {
  notifyEmailVoting?: boolean;
  notifyEmailReminder?: boolean;
  notifyEmailWinner?: boolean;
  notifyEmailComments?: boolean;
  notifyEmailMentions?: boolean;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const authUser = await getAuthUser();
    const { userId } = await params;

    // Users can only access their own preferences
    if (authUser.id !== userId) {
      return badRequest("Unauthorized", 401);
    }

    const preferences = await getUserPreferences(userId);
    return ok({ preferences });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const authUser = await getAuthUser();
    const { userId } = await params;
    const body = await parseBody<PreferencesBody>(request);

    // Users can only update their own preferences
    if (authUser.id !== userId) {
      return badRequest("Unauthorized", 401);
    }

    // Validate that at least one field is provided
    const hasField = 
      body.notifyEmailVoting !== undefined ||
      body.notifyEmailReminder !== undefined ||
      body.notifyEmailWinner !== undefined ||
      body.notifyEmailComments !== undefined ||
      body.notifyEmailMentions !== undefined;

    if (!hasField) {
      return badRequest("At least one preference field is required");
    }

    const preferences = await updateUserPreferences(userId, {
      notifyEmailVoting: body.notifyEmailVoting,
      notifyEmailReminder: body.notifyEmailReminder,
      notifyEmailWinner: body.notifyEmailWinner,
      notifyEmailComments: body.notifyEmailComments,
      notifyEmailMentions: body.notifyEmailMentions,
    });

    return ok({ preferences });
  } catch (error) {
    return handleRouteError(error);
  }
}
