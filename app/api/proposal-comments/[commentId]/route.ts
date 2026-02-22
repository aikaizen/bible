import { handleRouteError, ok } from "@/lib/api";
import { getAuthUser } from "@/lib/auth-helpers";
import { deleteProposalComment } from "@/lib/service";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ commentId: string }> },
) {
  try {
    const user = await getAuthUser();
    const { commentId } = await context.params;
    const data = await deleteProposalComment({ commentId, userId: user.id });
    return ok(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
