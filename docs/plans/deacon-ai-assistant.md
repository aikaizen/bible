# Deacon AI Assistant

Deacon is a Bible study AI assistant that participates in group discussions. Users @mention `@deacon` in comments or annotation reply threads, and Deacon responds with a short 1-2 sentence answer.

## How It Works

### Trigger Flow

1. User posts a comment or annotation reply containing `@deacon`
2. The comment is saved normally (user sees it instantly)
3. **Fire-and-forget**: after the transaction commits, the service layer asynchronously triggers Deacon
4. Deacon fetches the Bible passage text, gathers recent chat context, builds a prompt, calls the LLM, and inserts a reply
5. The reply appears on next refresh/poll (typically 1-3 seconds later)

### Architecture

```
User posts "@deacon what does this mean?"
        │
        ▼
  service.ts createComment() / createAnnotationReply()
        │
        ├── Insert comment (transaction)
        ├── Notify mentioned users
        └── void handleDeaconMention().catch(() => {})   ← fire-and-forget
                │
                ▼
          lib/deacon.ts
                │
                ├── ensureDeaconUser()     → upsert bot user, cache ID
                ├── fetchBibleText()       → GET /api/bible?reference=...
                ├── Fetch recent messages  → last ~10 in thread
                ├── buildPrompt()          → system + user messages
                ├── callFireworks()         → Fireworks.ai API
                └── insertDeaconComment()  → direct DB insert (bypasses auth)
```

### Key Design Decisions

- **No group membership required**: Deacon inserts directly via DB, bypassing `requireMembership`
- **Silent failure**: If `FIREWORKS_API_KEY` is missing or the API errors, nothing happens — no user-facing errors
- **Response length**: `max_tokens: 150` enforced at LLM level, hard truncated to 500 chars at app level
- **Cached bot user ID**: The Deacon user UUID is cached in a module-level variable after first upsert

## Database

Deacon is a regular user row with `is_bot = TRUE`:

```sql
-- Added to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT FALSE;

-- Deacon user (auto-created on first mention)
INSERT INTO users(name, email, default_language, is_bot)
VALUES ('Deacon', 'deacon@system.local', 'en', TRUE)
ON CONFLICT (email) DO UPDATE SET is_bot = TRUE
RETURNING id
```

## Prompts

### System Prompt

```
You are Deacon, a friendly and knowledgeable Bible study assistant.
You are participating in a group Bible study discussion.
The group is reading {passageReference}.
Respond in 1-2 concise sentences. Be warm but substantive.
Only answer the specific question you were asked — nothing more.
```

### User Message (assembled from context)

```
Passage: John 3:1-21
Now there was a man of the Pharisees named Nicodemus, a ruler of the Jews.
This man came to Jesus by night and said to him, "Rabbi, we know that you
are a teacher come from God, for no one can do these signs that you do
unless God is with him." ...

[If annotation] Verse context: Verses 3-5: Jesus answered him, "Truly, truly,
I say to you, unless one is born again he cannot see the kingdom of God."...

Recent discussion:
Marcus: I think this passage is about spiritual rebirth
Sarah: But what did Nicodemus understand by "born again"?

Sarah: @deacon what does "born of water and the Spirit" mean in verse 5?
```

### LLM Configuration

| Parameter | Value |
|-----------|-------|
| Provider | Fireworks.ai |
| Model | `accounts/fireworks/models/llama-v3p1-8b-instruct` |
| Max tokens | 150 |
| Temperature | 0.7 |
| Endpoint | `https://api.fireworks.ai/inference/v1/chat/completions` |
| Auth | `Bearer $FIREWORKS_API_KEY` |

## UI

Bot comments display an **AI** badge (gold pill) next to the author name:

```
Deacon [AI]                                    2m ago
In verse 5, "born of water and the Spirit" likely refers to
both physical birth and spiritual renewal — Nicodemus is being
told that entering God's kingdom requires a transformation that
goes beyond natural understanding.
```

The badge is styled with `.comment-bot-badge` in `globals.css`.

## Files

| File | Role |
|------|------|
| `lib/deacon.ts` | LLM integration, context building, response insertion |
| `lib/service.ts` | @deacon detection in `createComment` and `createAnnotationReply` |
| `db/schema.sql` | `is_bot` column on users table |
| `app/page.tsx` | AI badge rendering on bot comments/replies |
| `app/globals.css` | `.comment-bot-badge` style |

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `FIREWORKS_API_KEY` | Yes (for Deacon to work) | Fireworks.ai API key |

If `FIREWORKS_API_KEY` is not set, Deacon silently does nothing.
