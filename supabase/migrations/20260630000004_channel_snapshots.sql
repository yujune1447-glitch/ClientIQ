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

alter table channel_snapshots enable row level security;
