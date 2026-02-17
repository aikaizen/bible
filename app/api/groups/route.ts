import { handleRouteError, ok, parseBody } from "@/lib/api";
import { createGroup } from "@/lib/service";

type CreateGroupBody = {
  name: string;
  timezone: string;
  ownerId: string;
  tiePolicy?: "ADMIN_PICK" | "RANDOM" | "EARLIEST";
  liveTally?: boolean;
};

export async function POST(request: Request) {
  try {
    const body = await parseBody<CreateGroupBody>(request);
    const data = await createGroup(body);
    return ok(data, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
