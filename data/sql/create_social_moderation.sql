-- Moderation foundation: reports + soft-delete metadata
create extension if not exists pgcrypto;

create table if not exists public.social_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.user_profiles(id) on delete cascade,
  target_type text not null check (target_type in ('status', 'comment')),
  target_id uuid not null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_social_reports_target on public.social_reports(target_type, target_id);
create index if not exists idx_social_reports_reporter on public.social_reports(reporter_id);
create index if not exists idx_social_reports_created_at on public.social_reports(created_at desc);

alter table public.social_reports enable row level security;

drop policy if exists "Users can file reports" on public.social_reports;
create policy "Users can file reports"
on public.social_reports
for insert
to authenticated
with check (auth.uid() = reporter_id);

alter table public.social_statuses
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.user_profiles(id),
  add column if not exists delete_reason text;

alter table public.social_comments
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.user_profiles(id),
  add column if not exists delete_reason text;
