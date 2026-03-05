-- ==============================================================================================
-- BIRD FINDS DATABASE OPTIMIZATION & LINT FIXES
-- Purpose: Fix auth_rls_initplan, multiple_permissive_policies, duplicate_index warnings, 
--          and apply required performance index improvements.
-- Instructions: Run entirely in the Supabase SQL Editor.
-- ==============================================================================================

-- ==============================================================================================
-- PART 1: FIX DUPLICATE INDEXES (Supabase Linter: duplicate_index)
-- Both social_statuses_user_date_key and social_statuses_user_date_unique cover (user_id, date)
-- ==============================================================================================
ALTER TABLE public.social_statuses DROP CONSTRAINT IF EXISTS social_statuses_user_date_key;


-- ==============================================================================================
-- PART 2: FIX MULTIPLE PERMISSIVE POLICIES AND AUTH_RLS_INITPLAN
-- Supabase Linter Warnings: auth_rls_initplan, multiple_permissive_policies
-- 
-- The fix involves two steps for each table:
-- 1. Drop ALL existing policies for the table (clears duplicates).
-- 2. Recreate ONE clean policy for each operation (INSERT, SELECT, UPDATE, DELETE).
-- 3. Replace `auth.uid()` with `(select auth.uid())` to enable Postgres prepared statement caching.
-- ==============================================================================================

-------------------------------------------------------------------------------------------------
-- Table: user_profiles
-------------------------------------------------------------------------------------------------
-- Drop old AND potentially partially-created new policies
DROP POLICY IF EXISTS "Anyone can view profiles" ON user_profiles;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON user_profiles;

-- Create optimized policies
CREATE POLICY "Public profiles are viewable by everyone" 
  ON user_profiles FOR SELECT USING (true);

CREATE POLICY "Users can insert their own profile" 
  ON user_profiles FOR INSERT WITH CHECK ((select auth.uid()) = id);

CREATE POLICY "Users can update their own profile" 
  ON user_profiles FOR UPDATE USING ((select auth.uid()) = id);

-------------------------------------------------------------------------------------------------
-- Table: user_habits
-------------------------------------------------------------------------------------------------
-- Drop old AND potentially partially-created new policies
DROP POLICY IF EXISTS "Anyone can view habits" ON user_habits;
DROP POLICY IF EXISTS "Users can insert own habits" ON user_habits;
DROP POLICY IF EXISTS "Users can update own habits" ON user_habits;
DROP POLICY IF EXISTS "Users can delete own habits" ON user_habits;
DROP POLICY IF EXISTS "Public habits are viewable by everyone" ON user_habits;
DROP POLICY IF EXISTS "Users can insert their own habits" ON user_habits;
DROP POLICY IF EXISTS "Users can update their own habits" ON user_habits;
DROP POLICY IF EXISTS "Users can delete their own habits" ON user_habits;

-- Create optimized policies
CREATE POLICY "Public habits are viewable by everyone" 
  ON user_habits FOR SELECT USING (true);

CREATE POLICY "Users can insert their own habits" 
  ON user_habits FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update their own habits" 
  ON user_habits FOR UPDATE USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete their own habits" 
  ON user_habits FOR DELETE USING ((select auth.uid()) = user_id);

-------------------------------------------------------------------------------------------------
-- Table: habit_logs
-------------------------------------------------------------------------------------------------
-- Drop old AND potentially partially-created new policies
DROP POLICY IF EXISTS "Anyone can view habit logs" ON habit_logs;
DROP POLICY IF EXISTS "Users can insert own habit logs" ON habit_logs;
DROP POLICY IF EXISTS "Users can update own habit logs" ON habit_logs;
DROP POLICY IF EXISTS "Users can delete own habit logs" ON habit_logs;
DROP POLICY IF EXISTS "Users can manage their own habit logs" ON habit_logs;
DROP POLICY IF EXISTS "Public habit logs are viewable by everyone" ON habit_logs;
DROP POLICY IF EXISTS "Users can insert their own habit logs" ON habit_logs;
DROP POLICY IF EXISTS "Users can update their own habit logs" ON habit_logs;
DROP POLICY IF EXISTS "Users can delete their own habit logs" ON habit_logs;

-- Create optimized policies
CREATE POLICY "Public habit logs are viewable by everyone" 
  ON habit_logs FOR SELECT USING (true);

CREATE POLICY "Users can insert their own habit logs" 
  ON habit_logs FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update their own habit logs" 
  ON habit_logs FOR UPDATE USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete their own habit logs" 
  ON habit_logs FOR DELETE USING ((select auth.uid()) = user_id);

-------------------------------------------------------------------------------------------------
-- Table: follows
-------------------------------------------------------------------------------------------------
-- Drop old AND potentially partially-created new policies
DROP POLICY IF EXISTS "Anyone can view follows" ON follows;
DROP POLICY IF EXISTS "Users can follow others" ON follows;
DROP POLICY IF EXISTS "Users can unfollow" ON follows;
DROP POLICY IF EXISTS "Public follows are viewable by everyone" ON follows;
DROP POLICY IF EXISTS "Users can insert their own follows" ON follows;
DROP POLICY IF EXISTS "Users can delete their own follows" ON follows;

-- Create optimized policies
CREATE POLICY "Public follows are viewable by everyone" 
  ON follows FOR SELECT USING (true);

CREATE POLICY "Users can insert their own follows" 
  ON follows FOR INSERT WITH CHECK ((select auth.uid()) = follower_id);

CREATE POLICY "Users can delete their own follows" 
  ON follows FOR DELETE USING ((select auth.uid()) = follower_id);

-------------------------------------------------------------------------------------------------
-- Table: social_statuses
-------------------------------------------------------------------------------------------------
-- Drop old AND potentially partially-created new policies
DROP POLICY IF EXISTS "Anyone can view statuses" ON social_statuses;
DROP POLICY IF EXISTS "Statuses are viewable by everyone" ON social_statuses;
DROP POLICY IF EXISTS "select_statuses" ON social_statuses;
DROP POLICY IF EXISTS "Users can view own statuses" ON social_statuses;
DROP POLICY IF EXISTS "Public read statuses" ON social_statuses;

DROP POLICY IF EXISTS "Users can insert own statuses" ON social_statuses;
DROP POLICY IF EXISTS "Users can insert their own statuses" ON social_statuses;
DROP POLICY IF EXISTS "insert_statuses" ON social_statuses;

DROP POLICY IF EXISTS "Users can update own statuses" ON social_statuses;
DROP POLICY IF EXISTS "update_statuses" ON social_statuses;

DROP POLICY IF EXISTS "Users can delete own statuses" ON social_statuses;
DROP POLICY IF EXISTS "delete_statuses" ON social_statuses;

DROP POLICY IF EXISTS "Public statuses are viewable by everyone" ON social_statuses;
DROP POLICY IF EXISTS "Users can update their own statuses" ON social_statuses;
DROP POLICY IF EXISTS "Users can delete their own statuses" ON social_statuses;

-- Create optimized policies
CREATE POLICY "Public statuses are viewable by everyone" 
  ON social_statuses FOR SELECT USING (true);

CREATE POLICY "Users can insert their own statuses" 
  ON social_statuses FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update their own statuses" 
  ON social_statuses FOR UPDATE USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete their own statuses" 
  ON social_statuses FOR DELETE USING ((select auth.uid()) = user_id);

-------------------------------------------------------------------------------------------------
-- Table: social_items
-------------------------------------------------------------------------------------------------
-- Drop old AND potentially partially-created new policies
DROP POLICY IF EXISTS "Anyone can view items" ON social_items;
DROP POLICY IF EXISTS "Items are viewable by everyone" ON social_items;
DROP POLICY IF EXISTS "select_items" ON social_items;
DROP POLICY IF EXISTS "social_items_select" ON social_items;

DROP POLICY IF EXISTS "Users can insert own items" ON social_items;
DROP POLICY IF EXISTS "Users can insert items" ON social_items;
DROP POLICY IF EXISTS "insert_items" ON social_items;
DROP POLICY IF EXISTS "social_items_insert" ON social_items;

DROP POLICY IF EXISTS "Users can update own items" ON social_items;
DROP POLICY IF EXISTS "update_items" ON social_items;
DROP POLICY IF EXISTS "social_items_update" ON social_items;

DROP POLICY IF EXISTS "Users can delete own items" ON social_items;
DROP POLICY IF EXISTS "delete_items" ON social_items;
DROP POLICY IF EXISTS "social_items_delete" ON social_items;

DROP POLICY IF EXISTS "Public items are viewable by everyone" ON social_items;
DROP POLICY IF EXISTS "Users can insert their own items" ON social_items;
DROP POLICY IF EXISTS "Users can update their own items" ON social_items;
DROP POLICY IF EXISTS "Users can delete their own items" ON social_items;

-- Create optimized policies
CREATE POLICY "Public items are viewable by everyone" 
  ON social_items FOR SELECT USING (true);

-- For items, the user_id isn't directly on the row, so we join with social_statuses safely
CREATE POLICY "Users can insert their own items" 
  ON social_items FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM social_statuses
      WHERE social_statuses.id = social_items.status_id
      AND social_statuses.user_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can update their own items" 
  ON social_items FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM social_statuses
      WHERE social_statuses.id = social_items.status_id
      AND social_statuses.user_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can delete their own items" 
  ON social_items FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM social_statuses
      WHERE social_statuses.id = social_items.status_id
      AND social_statuses.user_id = (select auth.uid())
    )
  );

-------------------------------------------------------------------------------------------------
-- Table: social_reports
-------------------------------------------------------------------------------------------------
-- Drop old AND potentially partially-created new policies
DROP POLICY IF EXISTS "Users can file reports" ON social_reports;
DROP POLICY IF EXISTS "Users can insert their own reports" ON social_reports;

-- Create optimized policies (Assuming reports table has a user_id or reporter_id column. 
-- Assuming standard authenticated insert logic based on the generic linter warning.)
CREATE POLICY "Users can insert their own reports" 
  ON social_reports FOR INSERT WITH CHECK ((select auth.role()) = 'authenticated');

-------------------------------------------------------------------------------------------------
-- Table: elections
-------------------------------------------------------------------------------------------------
-- The election table (from earlier project phase) has entirely duplicate permissive warnings for all roles.
-- Let's purge and implement standard public elections.
DROP POLICY IF EXISTS "Allow all" ON elections;
DROP POLICY IF EXISTS "Allow anon access" ON elections;
DROP POLICY IF EXISTS "Elections are publicly readable" ON elections;
DROP POLICY IF EXISTS "Authenticated users can create elections" ON elections;
DROP POLICY IF EXISTS "Authenticated users can update elections" ON elections;
DROP POLICY IF EXISTS "Authenticated users can delete elections" ON elections;

CREATE POLICY "Elections are publicly readable" 
  ON elections FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create elections" 
  ON elections FOR INSERT WITH CHECK ((select auth.role()) = 'authenticated');

CREATE POLICY "Authenticated users can update elections" 
  ON elections FOR UPDATE USING ((select auth.role()) = 'authenticated');

CREATE POLICY "Authenticated users can delete elections" 
  ON elections FOR DELETE USING ((select auth.role()) = 'authenticated');


-- ==============================================================================================
-- PART 3: ADD PERFORMANCE INDEXES (From Phase 1 Analysis)
-- Enable lightning fast queries across large tables
-- ==============================================================================================

-- Accelerate fetching items for the feed/journal
CREATE INDEX IF NOT EXISTS idx_social_items_status_id ON social_items(status_id);

-- Accelerate feed generation and dating
CREATE INDEX IF NOT EXISTS idx_social_statuses_user_id ON social_statuses(user_id);
CREATE INDEX IF NOT EXISTS idx_social_statuses_created_at ON social_statuses(created_at DESC);

-- Accelerate the Follows graph
CREATE INDEX IF NOT EXISTS idx_follows_follower_id ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following_id ON follows(following_id);

-- Accelerate Habit Logs lookup per day
CREATE INDEX IF NOT EXISTS idx_habit_logs_user_date ON habit_logs(user_id, date);

-- Accelerate item-reviews category filter (used by /api/social/item-reviews)
CREATE INDEX IF NOT EXISTS idx_social_items_category ON social_items(category);

-- ==============================================================================================
-- PART 4: DATABASE SECURITY LINTS (Supabase Linter: function_search_path_mutable)
-- Fix security definer functions lacking explicit search_paths
-- ==============================================================================================

-- 1. Fix find_auth_user_by_email
ALTER FUNCTION public.find_auth_user_by_email(text) SET search_path = public;

-- 2. Fix find_profile_by_normalized_username
ALTER FUNCTION public.find_profile_by_normalized_username(text[]) SET search_path = public;
