-- Migration V3: BirdPile Social Media Transformation
-- Run this in the Supabase SQL Editor

-- ============================================================
-- 1. User Profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  avatar_url text,
  categories jsonb DEFAULT '[]'::jsonb, -- array of category ids the user uses
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view profiles" ON user_profiles
  FOR SELECT USING (true);
CREATE POLICY "Users can insert own profile" ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

-- ============================================================
-- 2. User Habits (definitions)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_habits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  icon text DEFAULT '✓',
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE user_habits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view habits" ON user_habits
  FOR SELECT USING (true);
CREATE POLICY "Users can insert own habits" ON user_habits
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own habits" ON user_habits
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own habits" ON user_habits
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 3. Habit Logs (daily completions)
-- ============================================================
CREATE TABLE IF NOT EXISTS habit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id uuid REFERENCES user_habits(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL,
  completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(habit_id, date)
);

ALTER TABLE habit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view habit logs" ON habit_logs
  FOR SELECT USING (true);
CREATE POLICY "Users can insert own habit logs" ON habit_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own habit logs" ON habit_logs
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own habit logs" ON habit_logs
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 4. Follows
-- ============================================================
CREATE TABLE IF NOT EXISTS follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  following_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(follower_id, following_id)
);

ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view follows" ON follows
  FOR SELECT USING (true);
CREATE POLICY "Users can follow others" ON follows
  FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "Users can unfollow" ON follows
  FOR DELETE USING (auth.uid() = follower_id);

-- ============================================================
-- 5. Update existing RLS policies on social_statuses
-- Make statuses publicly readable
-- ============================================================

-- Drop restrictive old policies
DROP POLICY IF EXISTS "Users can view own statuses" ON social_statuses;
DROP POLICY IF EXISTS "Public read statuses" ON social_statuses;

-- Public read
CREATE POLICY "Anyone can view statuses" ON social_statuses
  FOR SELECT USING (true);

-- Keep write policies (should already exist, but ensure)
DROP POLICY IF EXISTS "Users can insert own statuses" ON social_statuses;
CREATE POLICY "Users can insert own statuses" ON social_statuses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own statuses" ON social_statuses;
CREATE POLICY "Users can update own statuses" ON social_statuses
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own statuses" ON social_statuses;
CREATE POLICY "Users can delete own statuses" ON social_statuses
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 6. Update existing RLS policies on social_items
-- Make items publicly readable
-- ============================================================

DROP POLICY IF EXISTS "Users can view own items" ON social_items;
DROP POLICY IF EXISTS "Public read items" ON social_items;

CREATE POLICY "Anyone can view items" ON social_items
  FOR SELECT USING (true);

-- Keep existing write policies
DROP POLICY IF EXISTS "Users can insert own items" ON social_items;
CREATE POLICY "Users can insert own items" ON social_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM social_statuses
      WHERE social_statuses.id = social_items.status_id
      AND social_statuses.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update own items" ON social_items;
CREATE POLICY "Users can update own items" ON social_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM social_statuses
      WHERE social_statuses.id = social_items.status_id
      AND social_statuses.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete own items" ON social_items;
CREATE POLICY "Users can delete own items" ON social_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM social_statuses
      WHERE social_statuses.id = social_items.status_id
      AND social_statuses.user_id = auth.uid()
    )
  );

-- ============================================================
-- 7. Create storage bucket for avatars (run separately if needed)
-- ============================================================
-- INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true)
-- ON CONFLICT DO NOTHING;
