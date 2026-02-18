-- Manual Clerk -> existing BirdFinds user link template.
-- Paste this into Supabase SQL Editor, fill rows, then run.

begin;

-- Optional sanity: view existing profiles
-- select id, username from public.user_profiles order by username;

insert into public.clerk_user_links (clerk_user_id, supabase_user_id)
values
  -- ('user_39qqGVzSGFu95gpSZzqsb2Pugeq', 'fc8a034f-88c8-44ff-8a24-48405b1306d8'),
  -- ('user_39pBYdplp2DjN4WS0rvmZ7036ds', '12b02076-a13e-4c77-b274-1c97a1fec78d')
  -- ('user_39pB6aedXS0oAJ0KVb5fmjh7bwK', '550ee38d-8667-4c3e-8732-f7d7ec0b3db7')
  -- ('user_39pAeIiMki4b8nOJiF7V4VfbfLX', '63c2e13d-4726-4368-a112-0419b227de64')
  -- ('user_39p2CM2Wxo9Xd5eD2JDRniIVpuz', 'b4442c53-dc9a-4732-8153-df407b379c23')
  -- ('user_39nm8YLbkPMqmzIKy6clkDMzAHH', '1d72c8b0-83bf-4d8b-9e18-d6a9ac7422cd')
  -- ('user_39gjOnCtGAyfpArznqYfyW8E1ki', 'dfa86b08-72b1-4443-94c3-9fd516cfa778')
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

