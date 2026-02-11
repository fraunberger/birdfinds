-- FIX: Ensure `habit_logs` has the correct schema and RLS policies

-- 1. Add `notes` column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'habit_logs' AND column_name = 'notes') THEN
        ALTER TABLE habit_logs ADD COLUMN notes text DEFAULT '';
    END IF;
END $$;

-- 2. Ensure UNIQUE constraint on (habit_id, date)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'habit_logs_habit_id_date_key'
    ) THEN
        ALTER TABLE habit_logs ADD CONSTRAINT habit_logs_habit_id_date_key UNIQUE (habit_id, date);
    END IF;
END $$;

-- 3. Update RLS policies to ensure UPSERT works (INSERT + UPDATE)
DROP POLICY IF EXISTS "Users can manage their own habit logs" ON habit_logs;
CREATE POLICY "Users can manage their own habit logs"
ON habit_logs FOR ALL
USING (auth.uid() = user_id);

-- 4. Grant permissions just in case
GRANT ALL ON habit_logs TO authenticated;
GRANT ALL ON habit_logs TO service_role;
