-- Adds server-side notification seen tracking so "read" state syncs across devices.
-- When a user clears their notifications, we record a timestamp. Any comment
-- notification created before that timestamp is considered seen on all devices.

alter table public.user_profiles
  add column if not exists notifications_seen_before timestamptz default null;
