-- Create mapping table between Clerk users and Supabase user IDs.
-- Run in Supabase SQL Editor before using Clerk-based write APIs.

create table if not exists public.clerk_user_links (
  clerk_user_id text primary key,
  supabase_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (supabase_user_id)
);

alter table public.clerk_user_links enable row level security;

drop policy if exists "service role only select clerk links" on public.clerk_user_links;
create policy "service role only select clerk links"
on public.clerk_user_links
for select
to service_role
using (true);

drop policy if exists "service role only write clerk links" on public.clerk_user_links;
create policy "service role only write clerk links"
on public.clerk_user_links
for all
to service_role
using (true)
with check (true);
