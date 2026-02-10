-- Add notes column to habit_logs for quick notes (e.g., "15 miles on Cannondale")
ALTER TABLE habit_logs ADD COLUMN IF NOT EXISTS notes text DEFAULT '';
