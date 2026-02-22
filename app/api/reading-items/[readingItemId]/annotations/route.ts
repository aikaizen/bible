import { handleRouteError, ok, parseBody } from "@/lib/api";
import { getAuthUser } from "@/lib/auth-helpers";
import { getAnnotations, createAnnotation } from "@/lib/service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ readingItemId: string }> },
) {
  try {
    const user = await getAuthUser();
    const { readingItemId } = await context.params;
    const annotations = await getAnnotations(readingItemId, user.id);
    return ok({ annotations });
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
    const body = await parseBody<{
      startVerse: number;
      endVerse: number;
      text: string;
    }>(request);

    const data = await createAnnotation({
      readingItemId,
      userId: user.id,
      startVerse: body.startVerse,
      endVerse: body.endVerse,
      text: body.text,
    });

    return ok(data, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
