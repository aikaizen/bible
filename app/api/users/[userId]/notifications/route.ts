import { handleRouteError, ok } from "@/lib/api";
import { getAuthUser } from "@/lib/auth-helpers";
import { getNotifications } from "@/lib/service";

export async function GET() {
  try {
    const user = await getAuthUser();
    const notifications = await getNotifications(user.id);
    return ok({ notifications });
  } catch (error) {
    return handleRouteError(error);
  }
}
