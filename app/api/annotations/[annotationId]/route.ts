import { handleRouteError, ok } from "@/lib/api";
import { getAuthUser } from "@/lib/auth-helpers";
import { deleteAnnotation } from "@/lib/service";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ annotationId: string }> },
) {
  try {
    const user = await getAuthUser();
    const { annotationId } = await context.params;
    const data = await deleteAnnotation({ annotationId, userId: user.id });
    return ok(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
