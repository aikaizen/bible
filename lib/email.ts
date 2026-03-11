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
    body { font-family: -apple-system, BlinkMacSystemFont, 'Georgia', 'Times New Roman', serif; line-height: 1.7; color: #2d3748; max-width: 600px; margin: 0 auto; padding: 20px; background: #faf9f7; }
    .container { background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
    .header { text-align: center; padding-bottom: 24px; margin-bottom: 28px; border-bottom: 2px solid #e8e0d5; }
    .header h1 { color: #4a5568; font-size: 22px; margin: 0; font-weight: 600; letter-spacing: -0.3px; }
    .tagline { font-size: 13px; color: #8b7355; margin-top: 6px; font-style: italic; }
    .content { margin-bottom: 28px; }
    .button { display: inline-block; background: #8b7355; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; margin: 16px 0; font-weight: 500; transition: background 0.2s; }
    .button:hover { background: #6d5a43; }
    .scripture-box { background: #faf8f5; border-left: 4px solid #c9a66b; padding: 20px; margin: 20px 0; border-radius: 0 8px 8px 0; }
    .scripture-ref { font-size: 18px; font-weight: 600; color: #4a5568; text-align: center; margin: 8px 0; }
    .footer { font-size: 12px; color: #8b7355; text-align: center; padding-top: 24px; border-top: 1px solid #e8e0d5; }
    .footer a { color: #8b7355; text-decoration: underline; }
    .greeting { font-size: 16px; color: #4a5568; margin-bottom: 16px; }
    .closing { margin-top: 24px; padding-top: 16px; color: #6d5a43; font-style: italic; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📖 ${FROM_NAME}</h1>
      <div class="tagline">Reading God's Word together</div>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>You're receiving this because you're part of a Bible reading community.</p>
      <p><a href="${unsubscribeUrl}">Unsubscribe from email notifications</a> &nbsp;|&nbsp; <a href="${APP_URL}">Open App</a></p>
      <p>&copy; ${year} ${FROM_NAME}</p>
    </div>
  </div>
</body>
</html>`;

  // Plain text version
  const text = `${FROM_NAME}
Reading God's Word together

${content.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()}

---
You're receiving this because you're part of a Bible reading community.
Unsubscribe: ${unsubscribeUrl}
Open App: ${APP_URL}
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
        subject: `A new week begins — casting lots for ${metadata.groupName || "your reading group"}`,
        content: `
          <p class="greeting">Peace be with you,</p>
          <p>A new week of Scripture reading has begun in <strong>${metadata.groupName || "your Bible reading group"}</strong>.</p>
          <p>Join your brothers and sisters in selecting this week's passage. Cast your vote or propose a reading that has been on your heart.</p>
          <p style="color: #6d5a43; margin: 16px 0;"><strong>Voting closes:</strong> ${metadata.closeTime ? new Date(metadata.closeTime).toLocaleString('en-US', { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : "soon"}</p>
          <a href="${APP_URL}/group/${metadata.groupId}" class="button">Cast Your Vote</a>
          <p class="closing">"Let the word of Christ dwell in you richly..." — Colossians 3:16</p>
        `
      };

    case "VOTING_REMINDER":
      return {
        subject: `Voting closes soon — make your voice heard in ${metadata.groupName || "your reading group"}`,
        content: `
          <p class="greeting">Greetings,</p>
          <p>The time to cast your vote is drawing to a close in <strong>${metadata.groupName || "your Bible reading group"}</strong>.</p>
          <p>Don't miss this opportunity to help shape the journey through Scripture that your community will take together this week.</p>
          <p style="color: #8b4513; margin: 16px 0;"><strong>Voting closes:</strong> ${metadata.closeTime ? new Date(metadata.closeTime).toLocaleString('en-US', { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : "soon"}</p>
          <a href="${APP_URL}/group/${metadata.groupId}" class="button">Cast Your Vote</a>
          <p class="closing">"Where two or three are gathered in my name..." — Matthew 18:20</p>
        `
      };

    case "WINNER_SELECTED":
      return {
        subject: `This week's passage — ${metadata.reference || "Selected Reading"}`,
        content: `
          <p class="greeting">Blessings,</p>
          <p>The Lord has guided your community to this week's reading in <strong>${metadata.groupName || "your group"}</strong>:</p>
          <div class="scripture-box">
            <div class="scripture-ref">${metadata.reference || "Selected Reading"}</div>
          </div>
          <p>May this passage speak to your hearts and draw you closer to Christ and to one another.</p>
          <a href="${APP_URL}/reading/${metadata.readingItemId}" class="button">Read & Discuss Together</a>
          <p class="closing">"Your word is a lamp to my feet and a light to my path." — Psalm 119:105</p>
        `
      };

    case "COMMENT_REPLY":
      return {
        subject: `${metadata.commenterName || "Someone"} responded to your reflection on ${metadata.reference || "this week's reading"}`,
        content: `
          <p class="greeting">Hello,</p>
          <p><strong>${metadata.commenterName || "A fellow reader"}</strong> has joined the conversation and responded to your thoughts on <strong>${metadata.reference || "this week's reading"}</strong>:</p>
          <div class="scripture-box">
            <p style="margin: 0; font-style: italic; color: #4a5568;">"${(metadata.commentText || "").substring(0, 200)}${(metadata.commentText || "").length > 200 ? '...' : ''}"</p>
            <p style="margin: 8px 0 0 0; font-size: 12px; color: #8b7355;">— ${metadata.commenterName || "A fellow reader"}</p>
          </div>
          <p>Iron sharpens iron. Join the discussion and share what God is teaching you through His Word.</p>
          <a href="${APP_URL}/reading/${metadata.readingItemId}" class="button">View the Conversation</a>
          <p class="closing">"As iron sharpens iron, so one person sharpens another." — Proverbs 27:17</p>
        `
      };

    case "MENTION":
      return {
        subject: `${metadata.mentionerName || "Someone"} mentioned you in the discussion on ${metadata.reference || "this week's reading"}`,
        content: `
          <p class="greeting">Hi there,</p>
          <p><strong>${metadata.mentionerName || "A fellow reader"}</strong> mentioned you in the conversation about <strong>${metadata.reference || "this week's reading"}</strong>.</p>
          <p>Your voice matters in this community. Come see what they shared and add your own insights from Scripture.</p>
          <a href="${APP_URL}/reading/${metadata.readingItemId}" class="button">Join the Discussion</a>
          <p class="closing">"Carry each other's burdens, and in this way you will fulfill the law of Christ." — Galatians 6:2</p>
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
