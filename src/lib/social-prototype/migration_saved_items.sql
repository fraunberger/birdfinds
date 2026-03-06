-- Migration: Add saved_items table
-- Allows users to save another user's tagged item as "Want to Check Out"

CREATE TABLE IF NOT EXISTS saved_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    item_id UUID NOT NULL,  -- references social_items.id (not FK to avoid issues on item delete)
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT,
    image TEXT,
    notes TEXT,
    rating SMALLINT,
    source_user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(user_id, item_id)
);

-- Add rating column to existing tables (idempotent)
ALTER TABLE saved_items ADD COLUMN IF NOT EXISTS rating SMALLINT;

-- Allow all authenticated users to read saved_items (for viewing other profiles' wants)
-- Allow users to insert/delete only their own saved_items
CREATE POLICY "saved_items_select_all" ON saved_items FOR SELECT USING (true);
CREATE POLICY "saved_items_insert_own" ON saved_items FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "saved_items_delete_own" ON saved_items FOR DELETE USING (user_id = auth.uid());

ALTER TABLE saved_items ENABLE ROW LEVEL SECURITY;
