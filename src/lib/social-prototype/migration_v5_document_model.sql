-- ============================================================
-- Migration V5: Consolidation to daily_posts (Postgres-JSONB Document Model)
-- Run this in the Supabase SQL Editor
-- ============================================================

-- 1. Create the daily_posts table
CREATE TABLE IF NOT EXISTS daily_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  content text,
  published boolean DEFAULT false,
  items jsonb DEFAULT '[]'::jsonb NOT NULL,
  habits jsonb DEFAULT '[]'::jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, date)
);

-- Enable RLS
ALTER TABLE daily_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view daily_posts" ON daily_posts
  FOR SELECT USING (true);
CREATE POLICY "Users can insert own daily_posts" ON daily_posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own daily_posts" ON daily_posts
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own daily_posts" ON daily_posts
  FOR DELETE USING (auth.uid() = user_id);

-- 2. Migrate existing data into daily_posts
-- We aggregate items and habits into JSON arrays per status/date.
-- If a user has a status, we migrate it and attach related items/habits.

INSERT INTO daily_posts (id, user_id, date, content, published, items, habits, created_at)
SELECT 
  s.id,
  s.user_id,
  s.date,
  s.content,
  s.published,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'category', i.category,
          'title', i.title,
          'subtitle', i.subtitle,
          'rating', i.rating,
          'notes', i.notes,
          'image', i.image
        )
      ) 
      FROM social_items i WHERE i.status_id = s.id
    ), 
    '[]'::jsonb
  ) as items,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'habitId', hl.habit_id,
          'completed', hl.completed
        )
      ) 
      FROM habit_logs hl WHERE hl.user_id = s.user_id AND hl.date = s.date
    ), 
    '[]'::jsonb
  ) as habits,
  s.created_at
FROM social_statuses s
ON CONFLICT (user_id, date) DO NOTHING;

-- Optionally, you can also migrate habit_logs that exist without a corresponding social_status for that date:
INSERT INTO daily_posts (user_id, date, content, published, items, habits)
SELECT 
  hl.user_id,
  hl.date,
  NULL as content,
  false as published,
  '[]'::jsonb as items,
  jsonb_agg(
    jsonb_build_object(
      'habitId', hl.habit_id,
      'completed', hl.completed
    )
  ) as habits
FROM habit_logs hl
WHERE NOT EXISTS (
  SELECT 1 FROM social_statuses s WHERE s.user_id = hl.user_id AND s.date = hl.date
)
GROUP BY hl.user_id, hl.date
ON CONFLICT (user_id, date) DO NOTHING;

-- ============================================================
-- 3. Cleanup Old Tables (Uncomment when safe)
-- ============================================================
-- DROP TABLE IF EXISTS social_items CASCADE;
-- DROP TABLE IF EXISTS habit_logs CASCADE;
-- DROP TABLE IF EXISTS social_statuses CASCADE;
