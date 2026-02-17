import { badRequest, handleRouteError, ok, parseBody } from "@/lib/api";
import { getAuthUser } from "@/lib/auth-helpers";
import { createComment } from "@/lib/service";

type ReplyBody = {
  readingItemId: string;
  text: string;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ commentId: string }> },
) {
  try {
    const user = await getAuthUser();
    const { commentId } = await context.params;
    const body = await parseBody<ReplyBody>(request);

    if (!body.readingItemId || !body.text) {
      return badRequest("readingItemId and text are required", 422);
    }

    const data = await createComment({
      readingItemId: body.readingItemId,
      userId: user.id,
      text: body.text,
      parentId: commentId,
    });

    return ok(data, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
