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
  comment_sentiment jsonb,
  created_at timestamptz default now()
);

alter table channel_snapshots enable row level security;

alter table analyses add column if not exists instagram_summary jsonb;
alter table analyses add column if not exists tiktok_summary jsonb;
alter table analyses add column if not exists comment_intelligence jsonb;
