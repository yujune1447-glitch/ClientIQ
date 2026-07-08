-- TikTok data layer: scope tracking on the account (tiktok_connections),
-- per-video table, and a leaner analysis cache. Mirrors the YouTube caching pattern.

alter table tiktok_connections add column if not exists scope text;

create table if not exists tiktok_videos (
  id uuid primary key default gen_random_uuid(),
  tiktok_account_id uuid references tiktok_connections(id) on delete cascade not null,
  video_id text not null,
  title text,
  cover_url text,
  duration int default 0,
  view_count bigint default 0,
  like_count bigint default 0,
  comment_count bigint default 0,
  share_count bigint default 0,
  posted_at timestamptz,
  fetched_at timestamptz default now(),
  unique (tiktok_account_id, video_id)
);

alter table tiktok_videos enable row level security;

create index if not exists tiktok_videos_account_idx on tiktok_videos (tiktok_account_id);

create table if not exists tiktok_analysis_cache (
  id uuid primary key default gen_random_uuid(),
  tiktok_account_id uuid references tiktok_connections(id) on delete cascade not null unique,
  user_id uuid references users(id) on delete cascade not null,
  summary jsonb,
  video_count int default 0,
  computed_at timestamptz default now()
);

alter table tiktok_analysis_cache enable row level security;
