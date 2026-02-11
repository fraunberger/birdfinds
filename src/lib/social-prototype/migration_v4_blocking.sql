
-- Add muted_users to profile
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS muted_users uuid[] DEFAULT '{}';

-- Ensure it's not null for simpler logic
UPDATE user_profiles SET muted_users = '{}' WHERE muted_users IS NULL;
ALTER TABLE user_profiles ALTER COLUMN muted_users SET NOT NULL;

-- Policy: users can update their own muted_users list
-- Assuming existing policy covers UPDATE for auth.uid() = user_id

-- If not, verify policy:
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
CREATE POLICY "Users can update own profile" 
ON user_profiles FOR UPDATE 
USING (auth.uid() = user_id);
