-- =========================================================
-- RLS lockdown for all 9 public tables
-- =========================================================
-- Strategy:
--   * service_role bypasses RLS, so admin (via edge functions
--     using SUPABASE_SERVICE_ROLE_KEY) keeps full access without
--     needing JWT-email policies. All "admin can ..." dummy
--     policies are dropped.
--   * Frontend access patterns verified against index.html,
--     submit.html, profile.html, contact.html, admin.html.
--   * Idempotent: drops existing policies before recreating.
-- =========================================================

-- ---------- 1. admin_rate_limits ----------
-- Only ever touched by edge functions via service_role.
ALTER TABLE public.admin_rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies = no access for anon/authenticated. service_role bypasses.


-- ---------- 2. anonymous_ratings ----------
-- Frontend reads via REST with anon key (filter by anon_token).
-- INSERTs go through rate-track edge function (service_role).
ALTER TABLE public.anonymous_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read ratings" ON public.anonymous_ratings;
DROP POLICY IF EXISTS "anon_select_anonymous_ratings" ON public.anonymous_ratings;

CREATE POLICY "anon_select_anonymous_ratings"
  ON public.anonymous_ratings FOR SELECT
  TO anon, authenticated
  USING (true);
-- No INSERT/UPDATE/DELETE policies: rate-track edge function
-- handles all writes via service_role with rate limiting.


-- ---------- 3. comments ----------
-- Frontend: anon SELECT (read), authenticated INSERT (own).
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can delete comments" ON public.comments;
DROP POLICY IF EXISTS "Anyone can read comments" ON public.comments;
DROP POLICY IF EXISTS "Anyone can view comments" ON public.comments;
DROP POLICY IF EXISTS "Authenticated users can insert comments" ON public.comments;
DROP POLICY IF EXISTS "Users can delete own comments" ON public.comments;
DROP POLICY IF EXISTS "Users can delete their own comments" ON public.comments;
DROP POLICY IF EXISTS "Users can insert own comments" ON public.comments;
DROP POLICY IF EXISTS "comments_select" ON public.comments;
DROP POLICY IF EXISTS "comments_insert_own" ON public.comments;
DROP POLICY IF EXISTS "comments_update_own" ON public.comments;
DROP POLICY IF EXISTS "comments_delete_own" ON public.comments;

CREATE POLICY "comments_select"
  ON public.comments FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "comments_insert_own"
  ON public.comments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "comments_update_own"
  ON public.comments FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "comments_delete_own"
  ON public.comments FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);


-- ---------- 4. contact_messages ----------
-- Frontend: anon INSERT (contact form). Reads via service_role only.
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can delete contact_messages" ON public.contact_messages;
DROP POLICY IF EXISTS "Anyone can insert contact messages" ON public.contact_messages;
DROP POLICY IF EXISTS "Service role can read contact messages" ON public.contact_messages;
DROP POLICY IF EXISTS "anon_insert_contact_messages" ON public.contact_messages;
DROP POLICY IF EXISTS "contact_messages_insert" ON public.contact_messages;

CREATE POLICY "contact_messages_insert"
  ON public.contact_messages FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
-- No SELECT policy: only service_role can read messages.


-- ---------- 5. duration_seconds ----------
-- Conditional: only act if it actually exists as a table.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'duration_seconds' AND c.relkind = 'r'
  ) THEN
    EXECUTE 'ALTER TABLE public.duration_seconds ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "duration_seconds_insert" ON public.duration_seconds';
    EXECUTE 'CREATE POLICY "duration_seconds_insert" ON public.duration_seconds
             FOR INSERT TO anon, authenticated WITH CHECK (true)';
    -- No SELECT: only service_role reads aggregated listening data.
  END IF;
END $$;


-- ---------- 6. profiles ----------
-- Users see/edit only their own row. Signup creates row via
-- auth trigger (SECURITY DEFINER), which bypasses RLS.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;

CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);


-- ---------- 7. ratings ----------
-- Legacy/authenticated ratings table. Not used by frontend REST.
-- Allow anon INSERT (matches stated requirement) and owner SELECT.
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can insert ratings" ON public.ratings;
DROP POLICY IF EXISTS "Anyone can read ratings" ON public.ratings;
DROP POLICY IF EXISTS "Users can insert own ratings" ON public.ratings;
DROP POLICY IF EXISTS "Users can update own ratings" ON public.ratings;
DROP POLICY IF EXISTS "ratings_insert" ON public.ratings;
DROP POLICY IF EXISTS "ratings_select_own" ON public.ratings;
DROP POLICY IF EXISTS "ratings_update_own" ON public.ratings;

CREATE POLICY "ratings_insert"
  ON public.ratings FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "ratings_select_own"
  ON public.ratings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "ratings_update_own"
  ON public.ratings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ---------- 8. tracks ----------
-- Frontend: anon SELECT, authenticated INSERT/UPDATE/DELETE own rows.
-- (submit.html lets users submit their own tracks; profile.html
--  lets them delete their own.)
ALTER TABLE public.tracks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can delete tracks" ON public.tracks;
DROP POLICY IF EXISTS "Allow authenticated insert" ON public.tracks;
DROP POLICY IF EXISTS "Anyone can read tracks" ON public.tracks;
DROP POLICY IF EXISTS "Anyone can view tracks" ON public.tracks;
DROP POLICY IF EXISTS "Authenticated users can insert tracks" ON public.tracks;
DROP POLICY IF EXISTS "Logged in users can insert tracks" ON public.tracks;
DROP POLICY IF EXISTS "Users can delete own tracks" ON public.tracks;
DROP POLICY IF EXISTS "Users can delete their own tracks" ON public.tracks;
DROP POLICY IF EXISTS "Users can update own tracks" ON public.tracks;
DROP POLICY IF EXISTS "tracks_select" ON public.tracks;
DROP POLICY IF EXISTS "tracks_insert_own" ON public.tracks;
DROP POLICY IF EXISTS "tracks_update_own" ON public.tracks;
DROP POLICY IF EXISTS "tracks_delete_own" ON public.tracks;

CREATE POLICY "tracks_select"
  ON public.tracks FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "tracks_insert_own"
  ON public.tracks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tracks_update_own"
  ON public.tracks FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tracks_delete_own"
  ON public.tracks FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);


-- ---------- 9. votes ----------
-- Not currently called from frontend REST. Lock down strictly:
-- authenticated users insert/read/delete only their own.
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view votes" ON public.votes;
DROP POLICY IF EXISTS "Authenticated users can insert votes" ON public.votes;
DROP POLICY IF EXISTS "Users can delete their own votes" ON public.votes;
DROP POLICY IF EXISTS "votes_select_own" ON public.votes;
DROP POLICY IF EXISTS "votes_insert_own" ON public.votes;
DROP POLICY IF EXISTS "votes_delete_own" ON public.votes;

CREATE POLICY "votes_select_own"
  ON public.votes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "votes_insert_own"
  ON public.votes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "votes_delete_own"
  ON public.votes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);


-- =========================================================
-- Verification queries (run manually in SQL editor)
-- =========================================================
-- SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
-- FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public'
--   AND c.relname IN ('admin_rate_limits','anonymous_ratings','comments',
--                     'contact_messages','duration_seconds','profiles',
--                     'ratings','tracks','votes')
-- ORDER BY c.relname;
--
-- SELECT tablename, policyname, cmd, roles
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;
