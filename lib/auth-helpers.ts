import { auth } from "./auth";

export async function getAuthUser(): Promise<{ id: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  return { id: session.user.id };
}
