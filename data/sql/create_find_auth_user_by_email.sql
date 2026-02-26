-- Direct lookup of auth.users by email, replacing the multi-page
-- pagination scan through listUsers API.
-- Uses security definer to access auth schema from public context.
create or replace function public.find_auth_user_by_email(target_email text)
returns uuid
language sql stable security definer
as $$
  select id from auth.users
  where lower(email) = lower(target_email)
  limit 1;
$$;
