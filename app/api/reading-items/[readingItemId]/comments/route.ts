import { badRequest, handleRouteError, ok, parseBody } from "@/lib/api";
import { getAuthUser } from "@/lib/auth-helpers";
import { createComment, getComments } from "@/lib/service";

type CreateCommentBody = {
  text: string;
  parentId?: string;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ readingItemId: string }> },
) {
  try {
    const user = await getAuthUser();
    const { readingItemId } = await context.params;

    const comments = await getComments(readingItemId, user.id);
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
    const user = await getAuthUser();
    const { readingItemId } = await context.params;
    const body = await parseBody<CreateCommentBody>(request);

    if (!body.text) {
      return badRequest("text is required", 422);
    }

    const data = await createComment({
      readingItemId,
      userId: user.id,
      text: body.text,
      parentId: body.parentId,
    });

    return ok(data, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
