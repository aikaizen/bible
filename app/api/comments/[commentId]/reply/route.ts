import { badRequest, handleRouteError, ok, parseBody } from "@/lib/api";
import { createComment } from "@/lib/service";

type ReplyBody = {
  userId: string;
  readingItemId: string;
  text: string;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ commentId: string }> },
) {
  try {
    const { commentId } = await context.params;
    const body = await parseBody<ReplyBody>(request);

    if (!body.userId || !body.readingItemId || !body.text) {
      return badRequest("userId, readingItemId, and text are required", 422);
    }

    const data = await createComment({
      readingItemId: body.readingItemId,
      userId: body.userId,
      text: body.text,
      parentId: commentId,
    });

    return ok(data, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
