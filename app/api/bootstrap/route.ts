import { handleRouteError, ok } from "@/lib/api";
import { getAuthUser } from "@/lib/auth-helpers";
import { getBootstrapData } from "@/lib/service";

export async function GET() {
  try {
    const user = await getAuthUser();
    const data = await getBootstrapData({ isSuperAdmin: user.isSuperAdmin });
    return ok(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
