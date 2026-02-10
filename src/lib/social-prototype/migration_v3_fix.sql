-- Migration V3 FIX: Clean up conflicting RLS policies
-- Run this in the Supabase SQL Editor AFTER the main migration

-- ============================================================
-- 1. Drop ALL existing policies on social_statuses (clean slate)
-- ============================================================
DO $$ 
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname FROM pg_policies WHERE tablename = 'social_statuses'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON social_statuses', pol.policyname);
    END LOOP;
END $$;

-- Re-create clean policies
CREATE POLICY "select_statuses" ON social_statuses FOR SELECT USING (true);
CREATE POLICY "insert_statuses" ON social_statuses FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_statuses" ON social_statuses FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "delete_statuses" ON social_statuses FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 2. Drop ALL existing policies on social_items (clean slate)
-- ============================================================
DO $$ 
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname FROM pg_policies WHERE tablename = 'social_items'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON social_items', pol.policyname);
    END LOOP;
END $$;

-- Re-create clean policies
CREATE POLICY "select_items" ON social_items FOR SELECT USING (true);
CREATE POLICY "insert_items" ON social_items FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM social_statuses
        WHERE social_statuses.id = social_items.status_id
        AND social_statuses.user_id = auth.uid()
    )
);
CREATE POLICY "update_items" ON social_items FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM social_statuses
        WHERE social_statuses.id = social_items.status_id
        AND social_statuses.user_id = auth.uid()
    )
);
CREATE POLICY "delete_items" ON social_items FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM social_statuses
        WHERE social_statuses.id = social_items.status_id
        AND social_statuses.user_id = auth.uid()
    )
);

-- ============================================================
-- 3. Create avatars storage bucket + policies
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Drop any existing storage policies for avatars
DO $$ 
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname FROM pg_policies 
        WHERE tablename = 'objects' AND schemaname = 'storage'
        AND policyname LIKE '%avatar%'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
    END LOOP;
END $$;

-- Anyone can view avatars (public bucket)
CREATE POLICY "avatar_select" ON storage.objects
    FOR SELECT USING (bucket_id = 'avatars');

-- Authenticated users can upload their own avatar
CREATE POLICY "avatar_insert" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'avatars'
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Users can update their own avatar
CREATE POLICY "avatar_update" ON storage.objects
    FOR UPDATE USING (
        bucket_id = 'avatars'
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Users can delete their own avatar
CREATE POLICY "avatar_delete" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'avatars'
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );
