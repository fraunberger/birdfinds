-- Migrate existing BirdFinds users to Clerk links.
-- Run in Supabase SQL Editor after `create_clerk_user_links.sql`.
--
-- Workflow:
-- 1) Export users from Clerk Dashboard (CSV).
-- 2) Paste rows into the INSERT block below.
-- 3) Run this script.
-- 4) Check the final SELECTs for unmatched users.

begin;

create temporary table tmp_clerk_users (
  clerk_user_id text primary key,
  email text,
  username text
) on commit preserve rows;

-- Paste exported Clerk users here.
-- Example:
-- insert into tmp_clerk_users (clerk_user_id, email, username) values
-- ('user_abc123', 'mike@example.com', 'birdfinds-mike'),
-- ('user_def456', 'alex@example.com', 'alex');

with normalized as (
  select
    clerk_user_id,
    lower(coalesce(nullif(username, ''), '')) as username_key,
    lower(split_part(coalesce(email, ''), '@', 1)) as email_local_key
  from tmp_clerk_users
),
resolved as (
  select
    n.clerk_user_id,
    (
      select up.id
      from public.user_profiles up
      where
        (n.username_key <> '' and lower(up.username) = n.username_key)
        or
        (n.email_local_key <> '' and lower(up.username) = n.email_local_key)
      order by
        case
          when n.username_key <> '' and lower(up.username) = n.username_key then 0
          else 1
        end,
        up.created_at asc nulls last
      limit 1
    ) as supabase_user_id
  from normalized n
)
insert into public.clerk_user_links (clerk_user_id, supabase_user_id)
select r.clerk_user_id, r.supabase_user_id
from resolved r
where r.supabase_user_id is not null
on conflict (clerk_user_id) do update
set supabase_user_id = excluded.supabase_user_id;

-- Linked rows count
select count(*) as linked_count
from public.clerk_user_links
where clerk_user_id in (select clerk_user_id from tmp_clerk_users);

-- Clerk users that still did not match an existing user_profiles row
select t.*
from tmp_clerk_users t
left join public.clerk_user_links l on l.clerk_user_id = t.clerk_user_id
where l.clerk_user_id is null;

commit;
