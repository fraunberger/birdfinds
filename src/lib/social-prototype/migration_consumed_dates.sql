-- Migration: add consumed_dates to social_items
-- Run this in the Supabase SQL Editor.
--
-- consumed_dates stores every timestamp this item was consumed (tagged).
-- The first entry is set on INSERT; each SSOT re-tag appends a new timestamp.
-- This enables accurate rewatch/re-read counts and year-end date analysis.

ALTER TABLE social_items
  ADD COLUMN IF NOT EXISTS consumed_dates timestamptz[] NOT NULL DEFAULT '{}';

-- Backfill existing rows: treat created_at as the first (and only) consumption date.
UPDATE social_items
  SET consumed_dates = ARRAY[created_at]
  WHERE consumed_dates = '{}';
