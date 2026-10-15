-- Idempotent job saves: a client token makes a repeated save return the same job.
--   npx wrangler d1 execute nagiport-accounts --file=migrations/0004_jobs_token.sql

ALTER TABLE jobs ADD COLUMN client_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_user_token ON jobs(user_id, client_token) WHERE client_token IS NOT NULL;
