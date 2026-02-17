import { handleRouteError, ok } from "@/lib/api";
import { getAuthUser } from "@/lib/auth-helpers";
import { joinGroupByInvite } from "@/lib/service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const user = await getAuthUser();
    const { token } = await context.params;

    const data = await joinGroupByInvite({ token, userId: user.id });
    return ok(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
