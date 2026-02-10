-- Create social_statuses table
create table if not exists social_statuses (
  id uuid primary key default gen_random_uuid(),
  content text,
  date date unique, -- Ensure one entry per day
  created_at timestamptz default now()
);

-- Create social_items table
create table if not exists social_items (
  id uuid primary key default gen_random_uuid(),
  status_id uuid references social_statuses(id) on delete cascade,
  category text not null,
  title text not null,
  subtitle text, -- New: Artist, Brewery, Season/Episode, etc.
  rating int, -- 1-10
  notes text,
  image text,
  created_at timestamptz default now()
);
