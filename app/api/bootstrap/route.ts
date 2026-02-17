import { handleRouteError, ok } from "@/lib/api";
import { getBootstrapData } from "@/lib/service";

export async function GET() {
  try {
    const data = await getBootstrapData();
    return ok(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
