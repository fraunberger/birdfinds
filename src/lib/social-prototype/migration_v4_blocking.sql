
-- Add muted_users to profile
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS muted_users uuid[] DEFAULT '{}';

-- Ensure it's not null for simpler logic
UPDATE user_profiles SET muted_users = '{}' WHERE muted_users IS NULL;
ALTER TABLE user_profiles ALTER COLUMN muted_users SET NOT NULL;

-- Policy: users can update their own muted_users list
-- Corrected: user_profiles PK is 'id', not 'user_id'
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
CREATE POLICY "Users can update own profile" 
ON user_profiles FOR UPDATE 
USING (auth.uid() = id);
