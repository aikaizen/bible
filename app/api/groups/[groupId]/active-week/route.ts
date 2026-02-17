import { badRequest, handleRouteError, ok } from "@/lib/api";
import { getGroupSnapshot } from "@/lib/service";

export async function GET(
  request: Request,
  context: { params: Promise<{ groupId: string }> },
) {
  try {
    const { groupId } = await context.params;
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");

    if (!userId) {
      return badRequest("Missing userId query parameter", 422);
    }

    const snapshot = await getGroupSnapshot(groupId, userId);
    return ok(snapshot);
  } catch (error) {
    return handleRouteError(error);
  }
}
