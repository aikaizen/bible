import { handleRouteError, ok, parseBody } from "@/lib/api";
import { getAuthUser } from "@/lib/auth-helpers";
import { createGroup } from "@/lib/service";

type CreateGroupBody = {
  name: string;
  timezone: string;
  tiePolicy?: "ADMIN_PICK" | "RANDOM" | "EARLIEST";
  liveTally?: boolean;
};

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    const body = await parseBody<CreateGroupBody>(request);
    const data = await createGroup({ ...body, ownerId: user.id });
    return ok(data, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
