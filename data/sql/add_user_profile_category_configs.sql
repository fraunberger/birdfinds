-- Add per-user custom category display/input configuration.
-- Run in Supabase SQL Editor.

alter table public.user_profiles
add column if not exists category_configs jsonb not null default '{}'::jsonb;
