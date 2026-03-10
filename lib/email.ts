import { Resend } from "resend";

// Initialize Resend client
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const FROM_EMAIL = process.env.EMAIL_FROM || "notifications@biblecompanion.app";
const FROM_NAME = process.env.EMAIL_FROM_NAME || "Bible Reading Companion";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export type NotificationType = 
  | "VOTING_OPENED" 
  | "VOTING_REMINDER" 
  | "WINNER_SELECTED" 
  | "COMMENT_REPLY" 
  | "MENTION";

export interface EmailUser {
  id: string;
  name: string;
  email: string;
  unsubscribeToken: string;
}

interface EmailMetadata {
  groupName?: string;
  reference?: string;
  weekDate?: string;
  closeTime?: string;
  commenterName?: string;
  commentText?: string;
  mentionerName?: string;
  readingItemId?: string;
  groupId?: string;
}

/**
 * Check if email service is configured
 */
export function isEmailConfigured(): boolean {
  return !!resend && !!process.env.RESEND_API_KEY;
}

/**
 * Generate unsubscribe URL
 */
function getUnsubscribeUrl(token: string): string {
  return `${APP_URL}/unsubscribe?token=${encodeURIComponent(token)}`;
}

/**
 * Base email template with common styling
 */
function baseEmailTemplate(content: string, unsubscribeUrl: string): { html: string; text: string } {
  const year = new Date().getFullYear();
  
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bible Reading Companion</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { border-bottom: 2px solid #4a5568; padding-bottom: 15px; margin-bottom: 25px; }
    .header h1 { color: #2d3748; font-size: 24px; margin: 0; }
    .content { background: #f7fafc; padding: 25px; border-radius: 8px; margin-bottom: 25px; }
    .button { display: inline-block; background: #4a5568; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 15px 0; }
    .footer { font-size: 12px; color: #718096; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 20px; }
    .footer a { color: #4a5568; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${FROM_NAME}</h1>
  </div>
  <div class="content">
    ${content}
  </div>
  <div class="footer">
    <p>You're receiving this because you're a member of a Bible reading group.</p>
    <p><a href="${unsubscribeUrl}">Unsubscribe from email notifications</a></p>
    <p>&copy; ${year} ${FROM_NAME}</p>
  </div>
</body>
</html>`;

  // Plain text version
  const text = `${FROM_NAME}

${content.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()}

---
You're receiving this because you're a member of a Bible reading group.
Unsubscribe: ${unsubscribeUrl}
© ${year} ${FROM_NAME}`;

  return { html, text };
}

/**
 * Build email content based on notification type
 */
function buildEmailContent(type: NotificationType, metadata: EmailMetadata): { subject: string; content: string } {
  switch (type) {
    case "VOTING_OPENED":
      return {
        subject: `🗳️ Voting is open - ${metadata.groupName || "Bible Reading Group"}`,
        content: `
          <h2>Voting is now open!</h2>
          <p>A new week has started in <strong>${metadata.groupName || "your Bible reading group"}</strong>.</p>
          <p>Propose a passage or vote on existing proposals for this week's reading.</p>
          <p><strong>Voting closes:</strong> ${metadata.closeTime || "soon"}</p>
          <a href="${APP_URL}/group/${metadata.groupId}" class="button">Go to Voting</a>
        `
      };

    case "VOTING_REMINDER":
      return {
        subject: `⏰ Voting closes soon - ${metadata.groupName || "Bible Reading Group"}`,
        content: `
          <h2>Voting closes soon!</h2>
          <p>Don't forget to cast your vote in <strong>${metadata.groupName || "your Bible reading group"}</strong>.</p>
          <p><strong>Voting closes:</strong> ${metadata.closeTime || "soon"}</p>
          <a href="${APP_URL}/group/${metadata.groupId}" class="button">Cast Your Vote</a>
        `
      };

    case "WINNER_SELECTED":
      return {
        subject: `📖 This week's reading: ${metadata.reference || "Selected Passage"}`,
        content: `
          <h2>This week's reading has been chosen!</h2>
          <p>The winning passage for <strong>${metadata.groupName || "your group"}</strong> is:</p>
          <p style="font-size: 20px; font-weight: bold; color: #2d3748; text-align: center; margin: 25px 0; padding: 20px; background: #edf2f7; border-radius: 8px;">
            ${metadata.reference || "Selected Passage"}
          </p>
          <a href="${APP_URL}/reading/${metadata.readingItemId}" class="button">Join the Discussion</a>
        `
      };

    case "COMMENT_REPLY":
      return {
        subject: `💬 ${metadata.commenterName || "Someone"} replied to your comment`,
        content: `
          <h2>New reply to your comment</h2>
          <p><strong>${metadata.commenterName || "Someone"}</strong> replied in the discussion on <strong>${metadata.reference || "this week's reading"}</strong>:</p>
          <blockquote style="border-left: 4px solid #4a5568; padding-left: 15px; margin: 20px 0; color: #4a5568;">
            "${metadata.commentText || ""}"
          </blockquote>
          <a href="${APP_URL}/reading/${metadata.readingItemId}" class="button">View Reply</a>
        `
      };

    case "MENTION":
      return {
        subject: `👋 ${metadata.mentionerName || "Someone"} mentioned you`,
        content: `
          <h2>You were mentioned</h2>
          <p><strong>${metadata.mentionerName || "Someone"}</strong> mentioned you in the discussion on <strong>${metadata.reference || "this week's reading"}</strong>:</p>
          <a href="${APP_URL}/reading/${metadata.readingItemId}" class="button">View Mention</a>
        `
      };

    default:
      return {
        subject: "Notification from Bible Reading Companion",
        content: `<p>You have a new notification.</p>`
      };
  }
}

/**
 * Send email to a user
 */
export async function sendEmail(
  user: EmailUser,
  type: NotificationType,
  metadata: EmailMetadata
): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    return { success: false, error: "Email service not configured" };
  }

  try {
    const { subject, content } = buildEmailContent(type, metadata);
    const { html, text } = baseEmailTemplate(content, getUnsubscribeUrl(user.unsubscribeToken));

    const { data, error } = await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: user.email,
      subject,
      html,
      text,
    });

    if (error) {
      console.error("[Email] Failed to send:", error);
      return { success: false, error: error.message };
    }

    console.log(`[Email] Sent ${type} to ${user.email} (id: ${data?.id})`);
    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("[Email] Exception:", errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Get email preference column name for notification type
 */
export function getEmailPreferenceColumn(type: NotificationType): string {
  switch (type) {
    case "VOTING_OPENED":
      return "notify_email_voting";
    case "VOTING_REMINDER":
      return "notify_email_reminder";
    case "WINNER_SELECTED":
      return "notify_email_winner";
    case "COMMENT_REPLY":
      return "notify_email_comments";
    case "MENTION":
      return "notify_email_mentions";
    default:
      return "notify_email_voting";
  }
}
