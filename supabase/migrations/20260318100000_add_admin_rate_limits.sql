-- P3: Persistent admin rate limiting table
-- Replaces in-memory Map that resets on cold start
-- No RLS needed — only accessed via service role in edge functions
CREATE TABLE IF NOT EXISTS admin_rate_limits (
  ip TEXT PRIMARY KEY,
  attempts INT NOT NULL DEFAULT 1,
  reset_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '15 minutes')
);

-- Auto-cleanup: delete expired entries periodically
-- Can be triggered manually or via pg_cron if available
CREATE OR REPLACE FUNCTION cleanup_admin_rate_limits()
RETURNS void AS $$
  DELETE FROM admin_rate_limits WHERE reset_at < now();
$$ LANGUAGE sql;
