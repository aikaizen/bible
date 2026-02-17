import { badRequest, handleRouteError, ok, parseBody } from "@/lib/api";
import { getAuthUser } from "@/lib/auth-helpers";
import { deleteComment, editComment } from "@/lib/service";

type EditCommentBody = {
  text: string;
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ commentId: string }> },
) {
  try {
    const user = await getAuthUser();
    const { commentId } = await context.params;
    const body = await parseBody<EditCommentBody>(request);

    if (!body.text) {
      return badRequest("text is required", 422);
    }

    const data = await editComment({ commentId, userId: user.id, text: body.text });
    return ok(data);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ commentId: string }> },
) {
  try {
    const user = await getAuthUser();
    const { commentId } = await context.params;

    const data = await deleteComment({ commentId, userId: user.id });
    return ok(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
