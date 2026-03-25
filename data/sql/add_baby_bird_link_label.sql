-- Add baby_bird_link_label column to social_statuses
-- Display label for the baby bird URL (hyperlink mask text shown instead of raw URL)
ALTER TABLE social_statuses ADD COLUMN IF NOT EXISTS baby_bird_link_label TEXT;
