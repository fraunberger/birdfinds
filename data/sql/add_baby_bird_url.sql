-- Add baby_bird_url column to social_statuses
-- When non-null, the status is a "baby bird" (single URL + commentary, no tracked items)
ALTER TABLE social_statuses ADD COLUMN IF NOT EXISTS baby_bird_url TEXT;
