import { handleRouteError, ok } from "@/lib/api";
import { getNotifications } from "@/lib/service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  try {
    const { userId } = await context.params;
    const notifications = await getNotifications(userId);
    return ok({ notifications });
  } catch (error) {
    return handleRouteError(error);
  }
}
