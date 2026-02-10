-- Add subtitle column if it doesn't exist
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'social_items' and column_name = 'subtitle') then
    alter table social_items add column subtitle text;
  end if;
end $$;
