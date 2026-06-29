create table if not exists instagram_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade not null unique,
  ig_user_id text not null,
  username text,
  name text,
  profile_picture_url text,
  follower_count bigint default 0,
  media_count int default 0,
  page_id text,
  page_access_token text not null,
  user_access_token text not null,
  token_expires_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table instagram_connections enable row level security;

alter table analyses add column if not exists instagram_summary jsonb;
