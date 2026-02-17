import { badRequest, handleRouteError, ok, parseBody } from "@/lib/api";
import { ReadStatus, setReadMark } from "@/lib/service";

type ReadMarkBody = {
  userId: string;
  status: ReadStatus;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ readingItemId: string }> },
) {
  try {
    const { readingItemId } = await context.params;
    const body = await parseBody<ReadMarkBody>(request);

    if (!body.userId || !body.status) {
      return badRequest("userId and status are required", 422);
    }

    const data = await setReadMark({
      readingItemId,
      userId: body.userId,
      status: body.status,
    });

    return ok(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
