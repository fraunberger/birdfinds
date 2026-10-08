-- Ascents logged in the NH 4000 Footers app (/dark_eyed_junco).
-- Run in Supabase SQL Editor before signed-in hikers can save their logs.
-- Reads and writes go through /api/nh48/ascents with the service role.

create table if not exists public.nh48_ascents (
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Made by the browser, so an ascent keeps its id from before sign-in.
  id text not null,
  peak_id text not null,
  climbed_on date not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists nh48_ascents_user_date_idx
  on public.nh48_ascents (user_id, climbed_on);

alter table public.nh48_ascents enable row level security;

drop policy if exists "service role only select nh48 ascents" on public.nh48_ascents;
create policy "service role only select nh48 ascents"
on public.nh48_ascents
for select
to service_role
using (true);

drop policy if exists "service role only write nh48 ascents" on public.nh48_ascents;
create policy "service role only write nh48 ascents"
on public.nh48_ascents
for all
to service_role
using (true)
with check (true);
