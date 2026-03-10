import { handleRouteError, ok, badRequest, parseBody } from "@/lib/api";
import { dbQueryOne } from "@/lib/db";

interface UnsubscribeBody {
  token: string;
}

export async function POST(request: Request) {
  try {
    const body = await parseBody<UnsubscribeBody>(request);

    if (!body.token) {
      return badRequest("Unsubscribe token is required");
    }

    // Find user by unsubscribe token and disable all email notifications
    const result = await dbQueryOne<{
      id: string;
      name: string;
      email: string;
    }>(
      `UPDATE users
       SET notify_email_voting = false,
           notify_email_reminder = false,
           notify_email_winner = false,
           notify_email_comments = false,
           notify_email_mentions = false
       WHERE unsubscribe_token = $1
       RETURNING id, name, email`,
      [body.token]
    );

    if (!result) {
      return badRequest("Invalid unsubscribe token", 404);
    }

    return ok({
      success: true,
      message: `You have been unsubscribed from all email notifications for ${result.email}. You can re-enable notifications in your settings at any time.`
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
