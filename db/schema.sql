CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'group_role') THEN
    CREATE TYPE group_role AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tie_policy') THEN
    CREATE TYPE tie_policy AS ENUM ('ADMIN_PICK', 'RANDOM', 'EARLIEST');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'read_status') THEN
    CREATE TYPE read_status AS ENUM ('NOT_MARKED', 'PLANNED', 'READ');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'week_status') THEN
    CREATE TYPE week_status AS ENUM ('VOTING_OPEN', 'RESOLVED', 'PENDING_MANUAL');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
    CREATE TYPE notification_type AS ENUM (
      'VOTING_OPENED',
      'VOTING_REMINDER',
      'WINNER_SELECTED',
      'COMMENT_REPLY',
      'MENTION'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  default_language TEXT NOT NULL DEFAULT 'en',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  tie_policy tie_policy NOT NULL DEFAULT 'ADMIN_PICK',
  live_tally BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role group_role NOT NULL DEFAULT 'MEMBER',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS weeks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  voting_close_at TIMESTAMPTZ NOT NULL,
  reminder_sent_at TIMESTAMPTZ,
  resolved_reading_id UUID,
  status week_status NOT NULL DEFAULT 'VOTING_OPEN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, start_date)
);

CREATE TABLE IF NOT EXISTS proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id UUID NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  proposer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reference TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id UUID NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (week_id, user_id)
);

CREATE TABLE IF NOT EXISTS reading_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id UUID NOT NULL UNIQUE REFERENCES weeks(id) ON DELETE CASCADE,
  proposal_id UUID REFERENCES proposals(id) ON DELETE SET NULL,
  reference TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'weeks' AND constraint_name = 'weeks_resolved_reading_id_fkey'
  ) THEN
    ALTER TABLE weeks
      ADD CONSTRAINT weeks_resolved_reading_id_fkey
      FOREIGN KEY (resolved_reading_id)
      REFERENCES reading_items(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reading_item_id UUID NOT NULL REFERENCES reading_items(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text VARCHAR(500) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS read_marks (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reading_item_id UUID NOT NULL REFERENCES reading_items(id) ON DELETE CASCADE,
  status read_status NOT NULL DEFAULT 'NOT_MARKED',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, reading_item_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  text TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_weeks_group_id ON weeks(group_id);
CREATE INDEX IF NOT EXISTS idx_proposals_week_id ON proposals(week_id);
CREATE INDEX IF NOT EXISTS idx_votes_week_id ON votes(week_id);
CREATE INDEX IF NOT EXISTS idx_votes_proposal_id ON votes(proposal_id);
CREATE INDEX IF NOT EXISTS idx_comments_reading_item_id ON comments(reading_item_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id, created_at DESC);

-- Configurable vote duration per group (default 68h = Mon 00:00 to Wed 20:00)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'groups' AND column_name = 'voting_duration_hours'
  ) THEN
    ALTER TABLE groups ADD COLUMN voting_duration_hours INTEGER NOT NULL DEFAULT 68;
  END IF;
END
$$;

-- Seed proposal flag
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proposals' AND column_name = 'is_seed'
  ) THEN
    ALTER TABLE proposals ADD COLUMN is_seed BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END
$$;

-- Support multiple vote rounds per group (mid-week new votes after resolution)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'weeks' AND constraint_type = 'UNIQUE'
    AND constraint_name = 'weeks_group_id_start_date_key'
  ) THEN
    ALTER TABLE weeks DROP CONSTRAINT weeks_group_id_start_date_key;
  END IF;
END
$$;
CREATE INDEX IF NOT EXISTS idx_weeks_group_start ON weeks(group_id, start_date);

-- Invite tracking: recipient info and status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invites' AND column_name = 'recipient_name'
  ) THEN
    ALTER TABLE invites ADD COLUMN recipient_name TEXT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invites' AND column_name = 'recipient_contact'
  ) THEN
    ALTER TABLE invites ADD COLUMN recipient_contact TEXT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invites' AND column_name = 'status'
  ) THEN
    ALTER TABLE invites ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invites' AND column_name = 'accepted_by'
  ) THEN
    ALTER TABLE invites ADD COLUMN accepted_by UUID REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END
$$;

-- Google OAuth: stable account linking via Google sub ID
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'google_id'
  ) THEN
    ALTER TABLE users ADD COLUMN google_id TEXT UNIQUE;
  END IF;
END
$$;
