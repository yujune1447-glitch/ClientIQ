create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  google_id text unique not null,
  email text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists youtube_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade not null,
  channel_id text not null,
  channel_title text,
  channel_handle text,
  channel_thumbnail text,
  subscriber_count bigint default 0,
  video_count int default 0,
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, channel_id)
);

create table if not exists analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade not null,
  channel_id text not null,
  summary jsonb,
  brief jsonb,
  autopsy jsonb,
  total_videos int,
  created_at timestamptz default now()
);

alter table users enable row level security;
alter table youtube_connections enable row level security;
alter table analyses enable row level security;
