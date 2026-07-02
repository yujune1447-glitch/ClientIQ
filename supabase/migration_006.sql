create table if not exists tiktok_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade not null unique,
  open_id text not null,
  union_id text,
  display_name text,
  avatar_url text,
  follower_count bigint default 0,
  following_count bigint default 0,
  likes_count bigint default 0,
  video_count int default 0,
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table tiktok_connections enable row level security;

alter table analyses add column if not exists tiktok_summary jsonb;
