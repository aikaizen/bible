import { handleRouteError, ok, parseBody } from "@/lib/api";
import { getAuthUser } from "@/lib/auth-helpers";
import { createAnnotationReply } from "@/lib/service";

export async function POST(
  request: Request,
  context: { params: Promise<{ annotationId: string }> },
) {
  try {
    const user = await getAuthUser();
    const { annotationId } = await context.params;
    const body = await parseBody<{ text: string }>(request);

    const data = await createAnnotationReply({
      annotationId,
      userId: user.id,
      text: body.text,
    });

    return ok(data, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
