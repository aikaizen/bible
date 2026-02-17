import { badRequest, handleRouteError, ok, parseBody } from "@/lib/api";
import { createComment, getComments } from "@/lib/service";

type CreateCommentBody = {
  userId: string;
  text: string;
  parentId?: string;
};

export async function GET(
  request: Request,
  context: { params: Promise<{ readingItemId: string }> },
) {
  try {
    const { readingItemId } = await context.params;
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");

    if (!userId) {
      return badRequest("Missing userId query parameter", 422);
    }

    const comments = await getComments(readingItemId, userId);
    return ok({ comments });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ readingItemId: string }> },
) {
  try {
    const { readingItemId } = await context.params;
    const body = await parseBody<CreateCommentBody>(request);

    if (!body.userId || !body.text) {
      return badRequest("userId and text are required", 422);
    }

    const data = await createComment({
      readingItemId,
      userId: body.userId,
      text: body.text,
      parentId: body.parentId,
    });

    return ok(data, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
