import { handleRouteError, ok, parseBody } from "@/lib/api";
import { getAuthUser } from "@/lib/auth-helpers";
import {
  getUserProfile,
  updateUserProfile,
  getUserReadHistory,
  getUserCommentHistory,
} from "@/lib/service";

export async function GET() {
  try {
    const user = await getAuthUser();
    const [profile, readHistory, commentHistory] = await Promise.all([
      getUserProfile(user.id),
      getUserReadHistory(user.id),
      getUserCommentHistory(user.id),
    ]);
    return ok({
      profile: {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        avatarPreset: profile.avatar_preset,
        avatarImage: profile.avatar_image,
        createdAt: profile.created_at,
      },
      readHistory,
      commentHistory,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getAuthUser();
    const body = await parseBody<{
      name?: string;
      avatarPreset?: string | null;
      avatarImage?: string | null;
    }>(request);
    await updateUserProfile({
      userId: user.id,
      name: body.name,
      avatarPreset: body.avatarPreset,
      avatarImage: body.avatarImage,
    });
    return ok({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
