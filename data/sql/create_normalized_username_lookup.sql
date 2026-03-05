-- Server-side normalized username lookup to replace the client-side scan
-- that previously fetched up to 2000 profiles.
-- Normalizes by lowercasing and stripping non-alphanumeric characters,
-- then matches against the provided candidate array.
create or replace function public.find_profile_by_normalized_username(candidates text[])
returns table (
  id uuid,
  username text
) 
language sql security definer set search_path = public
as $$
  select up.id, up.username
  from public.user_profiles up
  where lower(regexp_replace(up.username, '[^a-zA-Z0-9]', '', 'g')) = any(candidates)
  limit 1;
$$;
