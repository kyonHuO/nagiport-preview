-- Store a content hash so a re-sent client token with different results is rejected.
--   npx wrangler d1 execute nagiport-accounts --file=migrations/0006_jobs_hash.sql

ALTER TABLE jobs ADD COLUMN content_hash TEXT;
