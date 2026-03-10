-- Migration: Add notification preferences and unsubscribe tokens to users table
-- Created: 2026-03-10

-- Add notification preference columns to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS notify_email_voting BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_email_reminder BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_email_winner BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_email_comments BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_email_mentions BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS unsubscribe_token UUID DEFAULT gen_random_uuid();

-- Create unique index on unsubscribe_token for fast lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_unsubscribe_token ON users(unsubscribe_token);

-- Add index on email columns for notification queries
CREATE INDEX IF NOT EXISTS idx_users_email_preferences ON users(id, notify_email_voting, notify_email_reminder, notify_email_winner, notify_email_comments, notify_email_mentions);
