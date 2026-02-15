-- Transfer data ownership from birdfinds-mike -> michael_fraunberger
-- Run in Supabase SQL Editor.
-- Safe to re-run: updates are deterministic.

begin;

do $$
declare
  source_user_id uuid;
  target_user_id uuid;
begin
  select id into source_user_id
  from user_profiles
  where username = 'birdfinds-mike'
  limit 1;

  if source_user_id is null then
    raise exception 'Source user not found: birdfinds-mike';
  end if;

  select id into target_user_id
  from user_profiles
  where username = 'michael_fraunberger'
  limit 1;

  if target_user_id is null then
    raise exception 'Target user not found: michael_fraunberger';
  end if;

  -- Move social posts
  update social_statuses
  set user_id = target_user_id
  where user_id = source_user_id;

  -- Move profile-linked habits
  update user_habits
  set user_id = target_user_id
  where user_id = source_user_id;

  update habit_logs
  set user_id = target_user_id
  where user_id = source_user_id;

  -- Move follower graph references
  update follows
  set follower_id = target_user_id
  where follower_id = source_user_id;

  update follows
  set following_id = target_user_id
  where following_id = source_user_id;

  -- Keep the target profile's username as requested.
  -- (No profile row merge/delete is performed here.)
end $$;

commit;

-- Verification queries
-- 1) Confirm no posts remain on source user
select count(*) as source_status_count
from social_statuses s
join user_profiles p on p.id = s.user_id
where p.username = 'birdfinds-mike';

-- 2) Confirm target owns posts
select count(*) as target_status_count
from social_statuses s
join user_profiles p on p.id = s.user_id
where p.username = 'michael_fraunberger';

-- 3) Inspect recent posts now owned by target
select s.id, s.date, s.created_at, s.published
from social_statuses s
join user_profiles p on p.id = s.user_id
where p.username = 'michael_fraunberger'
order by s.created_at desc
limit 20;
