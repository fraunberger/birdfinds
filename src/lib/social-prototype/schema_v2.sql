-- Drop tables if they act weird or just alter them. for prototype, dropping is cleaner if no important data.
-- But let's just make it idempotent-ish or 'create or replace' isn't a thing for tables.
-- Let's just assume we are migrating forward.

-- 1. Social Statuses: Add date column
-- We want one status per day.
alter table social_statuses add column if not exists date date default current_date;
-- Add unique constraint on user (implied single user for now) AND date
-- Since it's single user, just unique on date is enough.
alter table social_statuses add constraint unique_date unique (date);

-- 2. Social Items: Add tagging support
-- We need to know where in the text this item is mentioned (if at all).
-- simpler approach: We don't need a schema change for tagging if we just parse the text.
-- But user said "highlight it within the status". 
-- If we want to store explicit ranges, we can add a column.
-- Let's add `mention_indices` or similar? 
-- actually, simpler: Just store the Item and in the UI we match the Item Title to the Status Content string.
-- If the item title appears multiple times, we might need specific indices.
-- Let's add `highlight_ranges` jsonb column to social_items just in case?
-- Or better, `status_content_processed`? No.
-- Let's iterate. For MVP "Tagging", finding the string "The Matrix" in the text is robust enough.
-- No schema change needed for items yet.

-- Re-running the basic create if it didn't exist (safety)
create table if not exists social_statuses (
  id uuid primary key default gen_random_uuid(),
  content text,
  created_at timestamptz default now(),
  date date default current_date unique
);

create table if not exists social_items (
  id uuid primary key default gen_random_uuid(),
  status_id uuid references social_statuses(id) on delete cascade,
  category text not null,
  title text not null,
  rating int,
  notes text,
  image text,
  created_at timestamptz default now()
);

-- Policies (idempotent replacements)
drop policy if exists "Public read statuses" on social_statuses;
create policy "Public read statuses" on social_statuses for select using (true);
drop policy if exists "Public insert statuses" on social_statuses;
create policy "Public insert statuses" on social_statuses for insert with check (true);
drop policy if exists "Public update statuses" on social_statuses;
create policy "Public update statuses" on social_statuses for update using (true);
drop policy if exists "Public delete statuses" on social_statuses;
create policy "Public delete statuses" on social_statuses for delete using (true);

drop policy if exists "Public read items" on social_items;
create policy "Public read items" on social_items for select using (true);
drop policy if exists "Public insert items" on social_items;
create policy "Public insert items" on social_items for insert with check (true);
drop policy if exists "Public update items" on social_items;
create policy "Public update items" on social_items for update using (true);
drop policy if exists "Public delete items" on social_items;
create policy "Public delete items" on social_items for delete using (true);
