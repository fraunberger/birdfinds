-- Fix blocking constraint preventing multiple users from posting on the same day
-- Run this in the Supabase SQL Editor

-- 1. Drop the global unique constraint on 'date' if it exists.
-- The name might be "unique_date" (based on error logs) or "social_statuses_date_key".
ALTER TABLE social_statuses DROP CONSTRAINT IF EXISTS "unique_date";
ALTER TABLE social_statuses DROP CONSTRAINT IF EXISTS social_statuses_date_key;

-- 2. Ensure we have a per-user unique constraint instead.
-- This allows each user to have one status per day, but multiple users can have statuses on the same day.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'social_statuses_user_date_unique') THEN
        ALTER TABLE social_statuses ADD CONSTRAINT social_statuses_user_date_unique UNIQUE (user_id, date);
    END IF;
END $$;
