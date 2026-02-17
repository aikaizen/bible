import { badRequest, handleRouteError, ok, parseBody } from "@/lib/api";
import { getAuthUser } from "@/lib/auth-helpers";
import { ReadStatus, setReadMark } from "@/lib/service";

type ReadMarkBody = {
  status: ReadStatus;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ readingItemId: string }> },
) {
  try {
    const user = await getAuthUser();
    const { readingItemId } = await context.params;
    const body = await parseBody<ReadMarkBody>(request);

    if (!body.status) {
      return badRequest("status is required", 422);
    }

    const data = await setReadMark({
      readingItemId,
      userId: user.id,
      status: body.status,
    });

    return ok(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
