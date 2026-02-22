import { handleRouteError, ok } from "@/lib/api";
import { getAuthUser } from "@/lib/auth-helpers";
import { deleteAnnotationReply } from "@/lib/service";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ replyId: string }> },
) {
  try {
    const user = await getAuthUser();
    const { replyId } = await context.params;
    const data = await deleteAnnotationReply({ replyId, userId: user.id });
    return ok(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
