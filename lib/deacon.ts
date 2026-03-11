import { dbQuery, dbQueryOne } from "./db";

let cachedDeaconId: string | null = null;

async function ensureDeaconUser(): Promise<string> {
  if (cachedDeaconId) return cachedDeaconId;

  const row = await dbQueryOne<{ id: string }>(
    `INSERT INTO users(name, email, default_language, is_bot)
     VALUES ('Deacon', 'deacon@system.local', 'en', TRUE)
     ON CONFLICT (email) DO UPDATE SET is_bot = TRUE
     RETURNING id`,
  );

  if (!row) throw new Error("Failed to upsert Deacon user");
  cachedDeaconId = row.id;
  return cachedDeaconId;
}

type DeaconContext = {
  passageReference: string;
  passageText: string;
  verseContext?: string;
  recentMessages: Array<{ author: string; text: string }>;
  triggerMessage: string;
  triggerAuthor: string;
};

function buildPrompt(ctx: DeaconContext): Array<{ role: string; content: string }> {
  const system = [
    "You are Deacon, a friendly and knowledgeable Bible study assistant.",
    "You are participating in a group Bible study discussion.",
    `The group is reading ${ctx.passageReference}.`,
    "Respond in 1-2 concise sentences. Be warm but substantive.",
    "Only answer the specific question you were asked — nothing more.",
  ].join("\n");

  const parts: string[] = [];
  parts.push(`Passage: ${ctx.passageReference}\n${ctx.passageText}`);
  if (ctx.verseContext) {
    parts.push(`Verse context: ${ctx.verseContext}`);
  }
  if (ctx.recentMessages.length > 0) {
    parts.push(
      "Recent discussion:\n" +
        ctx.recentMessages.map((m) => `${m.author}: ${m.text}`).join("\n"),
    );
  }
  parts.push(`${ctx.triggerAuthor}: ${ctx.triggerMessage}`);

  return [
    { role: "system", content: system },
    { role: "user", content: parts.join("\n\n") },
  ];
}

async function callFireworks(
  messages: Array<{ role: string; content: string }>,
): Promise<string> {
  const apiKey = process.env.FIREWORKS_API_KEY;
  if (!apiKey) throw new Error("FIREWORKS_API_KEY not set");

  const res = await fetch(
    "https://api.fireworks.ai/inference/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "accounts/fireworks/models/llama-v3p1-8b-instruct",
        messages,
        max_tokens: 150,
        temperature: 0.7,
      }),
    },
  );

  if (!res.ok) {
    throw new Error(`Fireworks API error: ${res.status}`);
  }

  const data = await res.json();
  let text = (data.choices?.[0]?.message?.content ?? "").trim();
  if (text.length > 500) {
    text = text.slice(0, 497) + "...";
  }
  return text;
}

async function fetchBibleText(
  reference: string,
): Promise<{ text: string; verses: Array<{ verse: number; text: string }> }> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const res = await fetch(
    `${appUrl}/api/bible?reference=${encodeURIComponent(reference)}`,
  );
  if (!res.ok) return { text: "", verses: [] };
  return res.json();
}

async function insertDeaconComment(
  readingItemId: string,
  parentId: string,
  text: string,
) {
  const deaconId = await ensureDeaconUser();
  await dbQuery(
    `INSERT INTO comments(reading_item_id, parent_id, author_id, text)
     VALUES ($1, $2, $3, $4)`,
    [readingItemId, parentId, deaconId, text],
  );
}

async function insertDeaconAnnotationReply(
  annotationId: string,
  text: string,
) {
  const deaconId = await ensureDeaconUser();
  await dbQuery(
    `INSERT INTO annotation_replies(annotation_id, author_id, text)
     VALUES ($1, $2, $3)`,
    [annotationId, deaconId, text],
  );
}

export async function handleDeaconMention(params: {
  readingItemId: string;
  parentCommentId?: string;
  annotationId?: string;
  triggerText: string;
  triggerAuthorName: string;
  passageReference: string;
  verseRange?: { start: number; end: number };
}): Promise<void> {
  if (!process.env.FIREWORKS_API_KEY) return;

  const bible = await fetchBibleText(params.passageReference);
  if (!bible.text) return;

  let verseContext: string | undefined;
  if (params.verseRange && bible.verses.length > 0) {
    const relevant = bible.verses.filter(
      (v) =>
        v.verse >= params.verseRange!.start &&
        v.verse <= params.verseRange!.end,
    );
    if (relevant.length > 0) {
      verseContext = `Verses ${params.verseRange.start}-${params.verseRange.end}: ${relevant.map((v) => v.text).join(" ")}`;
    }
  }

  // Fetch recent messages for context
  let recentMessages: Array<{ author: string; text: string }> = [];
  if (params.annotationId) {
    const replies = await dbQuery<{ author_name: string; text: string }>(
      `SELECT u.name AS author_name, ar.text
       FROM annotation_replies ar
       JOIN users u ON u.id = ar.author_id
       WHERE ar.annotation_id = $1 AND ar.deleted_at IS NULL
       ORDER BY ar.created_at DESC
       LIMIT 10`,
      [params.annotationId],
    );
    recentMessages = replies.reverse().map((r) => ({
      author: r.author_name,
      text: r.text,
    }));
  } else if (params.parentCommentId) {
    const replies = await dbQuery<{ author_name: string; text: string }>(
      `SELECT u.name AS author_name, c.text
       FROM comments c
       JOIN users u ON u.id = c.author_id
       WHERE c.parent_id = $1 AND c.deleted_at IS NULL
       ORDER BY c.created_at DESC
       LIMIT 10`,
      [params.parentCommentId],
    );
    recentMessages = replies.reverse().map((r) => ({
      author: r.author_name,
      text: r.text,
    }));
  } else {
    // Top-level comment — get recent top-level comments
    const recent = await dbQuery<{ author_name: string; text: string }>(
      `SELECT u.name AS author_name, c.text
       FROM comments c
       JOIN users u ON u.id = c.author_id
       WHERE c.reading_item_id = $1 AND c.parent_id IS NULL AND c.deleted_at IS NULL
       ORDER BY c.created_at DESC
       LIMIT 10`,
      [params.readingItemId],
    );
    recentMessages = recent.reverse().map((r) => ({
      author: r.author_name,
      text: r.text,
    }));
  }

  const messages = buildPrompt({
    passageReference: params.passageReference,
    passageText: bible.text,
    verseContext,
    recentMessages,
    triggerMessage: params.triggerText,
    triggerAuthor: params.triggerAuthorName,
  });

  const response = await callFireworks(messages);
  if (!response) return;

  if (params.annotationId) {
    await insertDeaconAnnotationReply(params.annotationId, response);
  } else {
    // For top-level comments, reply to the triggering comment
    // For replies, reply to the same parent
    const parentId = params.parentCommentId;
    if (parentId) {
      await insertDeaconComment(params.readingItemId, parentId, response);
    }
    // If no parentId, it was a top-level comment — we need the inserted comment's ID
    // which we receive as parentCommentId from the caller
  }
}
