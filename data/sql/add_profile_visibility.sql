-- Add accounts-only visibility mode for social profiles.
-- Run in Supabase SQL Editor.

ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS visibility text;

UPDATE public.user_profiles
SET visibility = CASE
  WHEN is_private = true THEN 'private'
  ELSE 'public'
END
WHERE visibility IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_profiles_visibility_check'
  ) THEN
    ALTER TABLE public.user_profiles
    ADD CONSTRAINT user_profiles_visibility_check
    CHECK (visibility IN ('public', 'accounts', 'private'));
  END IF;
END $$;
