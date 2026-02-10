-- Migration: Add user authentication to social prototype
-- Run this in Supabase SQL Editor

-- Step 1: Add user_id column to social_statuses
ALTER TABLE social_statuses 
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- Step 2: Drop old unique constraint on date and add new one for (user_id, date)
ALTER TABLE social_statuses DROP CONSTRAINT IF EXISTS social_statuses_date_key;
ALTER TABLE social_statuses ADD CONSTRAINT social_statuses_user_date_unique UNIQUE (user_id, date);

-- Step 3: Enable Row Level Security
ALTER TABLE social_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_items ENABLE ROW LEVEL SECURITY;

-- Step 4: Create RLS policies for social_statuses
-- Users can only see their own statuses
CREATE POLICY "Users can view own statuses" ON social_statuses
    FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own statuses
CREATE POLICY "Users can insert own statuses" ON social_statuses
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own statuses
CREATE POLICY "Users can update own statuses" ON social_statuses
    FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own statuses
CREATE POLICY "Users can delete own statuses" ON social_statuses
    FOR DELETE USING (auth.uid() = user_id);

-- Step 5: Create RLS policies for social_items (through status ownership)
CREATE POLICY "Users can view own items" ON social_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM social_statuses 
            WHERE social_statuses.id = social_items.status_id 
            AND social_statuses.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert own items" ON social_items
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM social_statuses 
            WHERE social_statuses.id = social_items.status_id 
            AND social_statuses.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update own items" ON social_items
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM social_statuses 
            WHERE social_statuses.id = social_items.status_id 
            AND social_statuses.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete own items" ON social_items
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM social_statuses 
            WHERE social_statuses.id = social_items.status_id 
            AND social_statuses.user_id = auth.uid()
        )
    );
