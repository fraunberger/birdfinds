-- ============================================================
-- Feature Batch Migration
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Add 'published' column to social_statuses (default false = draft)
ALTER TABLE social_statuses
ADD COLUMN IF NOT EXISTS published boolean DEFAULT false;

-- Mark all existing statuses as published (so they don't disappear)
UPDATE social_statuses SET published = true WHERE published IS NULL OR published = false;

-- 2. Add 'is_private' column to user_profiles (default false = public)
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS is_private boolean DEFAULT false;

-- 3. Fix RLS on social_items for new accounts
-- The issue is that RLS may not allow inserting items referencing a status
-- that was JUST created. We ensure the policy checks ownership via the status.

-- Drop existing insert policy if it exists (safe re-run)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'social_items' AND policyname = 'social_items_insert'
    ) THEN
        DROP POLICY social_items_insert ON social_items;
    END IF;
END $$;

-- Recreate with a policy that checks the status belongs to the user
CREATE POLICY social_items_insert ON social_items
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM social_statuses
            WHERE social_statuses.id = status_id
            AND social_statuses.user_id = auth.uid()
        )
    );

-- Also ensure SELECT policy exists for public read
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'social_items' AND policyname = 'social_items_select'
    ) THEN
        CREATE POLICY social_items_select ON social_items
            FOR SELECT USING (true);
    END IF;
END $$;

-- Ensure UPDATE and DELETE policies exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'social_items' AND policyname = 'social_items_update'
    ) THEN
        CREATE POLICY social_items_update ON social_items
            FOR UPDATE USING (
                EXISTS (
                    SELECT 1 FROM social_statuses
                    WHERE social_statuses.id = status_id
                    AND social_statuses.user_id = auth.uid()
                )
            );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'social_items' AND policyname = 'social_items_delete'
    ) THEN
        CREATE POLICY social_items_delete ON social_items
            FOR DELETE USING (
                EXISTS (
                    SELECT 1 FROM social_statuses
                    WHERE social_statuses.id = status_id
                    AND social_statuses.user_id = auth.uid()
                )
            );
    END IF;
END $$;
