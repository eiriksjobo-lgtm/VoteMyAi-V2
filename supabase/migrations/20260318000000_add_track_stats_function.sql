-- H1: SQL aggregate function for track stats (replaces JS-based avg calculation)
-- Called via supabase.rpc('get_track_stats', { p_track_id: '...' })
CREATE OR REPLACE FUNCTION get_track_stats(p_track_id UUID)
RETURNS TABLE(avg_score NUMERIC, total_count BIGINT) AS $$
  SELECT
    COALESCE(AVG(score), 0)::NUMERIC,
    COUNT(*)::BIGINT
  FROM anonymous_ratings
  WHERE track_id = p_track_id;
$$ LANGUAGE sql STABLE;

-- K5: Unique constraint for upsert on (track_id, anon_token)
-- Required for the ON CONFLICT clause in rate-track upsert
ALTER TABLE anonymous_ratings
  ADD CONSTRAINT anonymous_ratings_track_token_unique
  UNIQUE (track_id, anon_token);
