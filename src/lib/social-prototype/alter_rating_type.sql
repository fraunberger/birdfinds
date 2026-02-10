-- Allow decimal ratings (e.g. 8.5)
-- Run this in the Supabase SQL Editor

ALTER TABLE social_items 
ALTER COLUMN rating TYPE numeric(3, 1); 
-- numeric(3,1) allows values like 10.0, 9.5, etc.
