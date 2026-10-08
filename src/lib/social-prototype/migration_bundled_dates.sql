-- Add bundled_dates column to social_statuses
-- bundled_dates is a JSON array of date strings (YYYY-MM-DD) that this status covers
-- in addition to its own date column. E.g., ["2026-03-18","2026-03-19","2026-03-20"]
-- when the status's date is 2026-03-21 means the status covers 4 days.
ALTER TABLE social_statuses ADD COLUMN IF NOT EXISTS bundled_dates JSONB;
