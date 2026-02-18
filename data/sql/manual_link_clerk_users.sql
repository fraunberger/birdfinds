-- Manual Clerk -> existing BirdFinds user link template.
-- Paste this into Supabase SQL Editor, fill rows, then run.

begin;

-- Optional sanity: view existing profiles
-- select id, username from public.user_profiles order by username;

insert into public.clerk_user_links (clerk_user_id, supabase_user_id)
values
  -- ('user_abc123', '11111111-1111-1111-1111-111111111111'),
  -- ('user_def456', '22222222-2222-2222-2222-222222222222')
  -- Add one row per user, then remove this trailing comment line.
on conflict (clerk_user_id) do update
set supabase_user_id = excluded.supabase_user_id;

commit;

-- Verify linked users
select
  l.clerk_user_id,
  l.supabase_user_id,
  p.username
from public.clerk_user_links l
left join public.user_profiles p on p.id = l.supabase_user_id
order by p.username nulls last, l.clerk_user_id;

