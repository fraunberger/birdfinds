-- Add unique constraint on (user_id, date) to prevent duplicate statuses
-- for the same user on the same day. This enables atomic upsert operations
-- instead of the previous select-then-insert/update pattern.
alter table public.social_statuses
  add constraint social_statuses_user_date_unique unique (user_id, date);
