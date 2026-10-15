-- Per-customer classification jobs and results (Cloudflare D1 / SQLite).
-- Apply after 0001_auth.sql:
--   npx wrangler d1 execute nagiport-accounts --file=migrations/0002_jobs.sql

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT,
  total INTEGER NOT NULL,
  counts_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS job_results (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  row_index INTEGER NOT NULL,
  source_id TEXT,
  text TEXT NOT NULL,
  category TEXT NOT NULL,
  candidate TEXT,
  score REAL,
  margin REAL,
  reason TEXT,
  nearest TEXT,
  method TEXT,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_job_results_job ON job_results(job_id, row_index);
