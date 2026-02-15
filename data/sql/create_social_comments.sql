-- Create simple per-status comments for Birdfinds
create extension if not exists pgcrypto;

create table if not exists public.social_comments (
  id uuid primary key default gen_random_uuid(),
  status_id uuid not null references public.social_statuses(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_social_comments_status_id on public.social_comments(status_id);
create index if not exists idx_social_comments_user_id on public.social_comments(user_id);
create index if not exists idx_social_comments_created_at on public.social_comments(created_at desc);

alter table public.social_comments enable row level security;

-- Public read to match public feed behavior.
drop policy if exists "Public can read comments" on public.social_comments;
create policy "Public can read comments"
on public.social_comments
for select
using (true);
