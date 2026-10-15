-- Fixed-window auth rate limiting (Cloudflare D1 / SQLite).
--   npx wrangler d1 execute nagiport-accounts --file=migrations/0003_ratelimit.sql

CREATE TABLE IF NOT EXISTS auth_attempts (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
