alter table analyses add column if not exists is_unread boolean default false;
alter table analyses add column if not exists generated_by text default 'manual';
