create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  google_id text unique not null,
  email text,
  niche text,
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
  raw_videos jsonb,
  summary jsonb,
  brief jsonb,
  autopsy jsonb,
  total_videos int,
  is_unread boolean default false,
  generated_by text default 'manual',
  created_at timestamptz default now()
);

create table if not exists channel_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade not null,
  channel_id text not null,
  analysis_id uuid references analyses(id) on delete cascade,
  subscriber_count bigint,
  avg_ctr numeric(8,4),
  avg_retention numeric(6,2),
  avg_views_per_video bigint,
  total_videos_analysed int,
  top_video_id text,
  top_video_title text,
  top_video_views bigint,
  top_video_score numeric(6,2),
  top_video_published_at timestamptz,
  new_videos_count int default 0,
  brief_followed boolean,
  brief_match_video_title text,
  brief_match_score int,
  content_breakdown jsonb,
  created_at timestamptz default now()
);

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

alter table users enable row level security;
alter table youtube_connections enable row level security;
alter table analyses enable row level security;
alter table channel_snapshots enable row level security;
alter table instagram_connections enable row level security;
