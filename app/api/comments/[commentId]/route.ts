import { badRequest, handleRouteError, ok, parseBody } from "@/lib/api";
import { deleteComment, editComment } from "@/lib/service";

type EditCommentBody = {
  userId: string;
  text: string;
};

type DeleteCommentBody = {
  userId: string;
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ commentId: string }> },
) {
  try {
    const { commentId } = await context.params;
    const body = await parseBody<EditCommentBody>(request);

    if (!body.userId || !body.text) {
      return badRequest("userId and text are required", 422);
    }

    const data = await editComment({ commentId, userId: body.userId, text: body.text });
    return ok(data);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ commentId: string }> },
) {
  try {
    const { commentId } = await context.params;
    const body = await parseBody<DeleteCommentBody>(request);

    if (!body.userId) {
      return badRequest("userId is required", 422);
    }

    const data = await deleteComment({ commentId, userId: body.userId });
    return ok(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
