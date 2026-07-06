-- Feedback loop Phase 1: capture whether a Done idea got posted and how it performed.
-- Matches the saved_ideas pattern: plain user_id uuid (no FK), no RLS (accessed via service-role admin client).

-- Denormalized pointers on saved_ideas so the Kanban board can render "shipped + verdict" without a join.
alter table saved_ideas
  add column if not exists posted_url        text,
  add column if not exists posted_video_id   text,
  add column if not exists latest_outcome_id uuid,
  add column if not exists outcome_verdict   text
    check (outcome_verdict in ('overperformed','on_par','underperformed','pending','not_posted'));

-- Time-series outcome captures. One idea can be captured multiple times as its video matures
-- (day 2 vs day 30), so history is a table, not a column. saved_ideas.latest_outcome_id points at the newest.
create table if not exists idea_outcomes (
  id                    uuid primary key default gen_random_uuid(),
  idea_id               uuid not null references saved_ideas(id) on delete cascade,
  user_id               uuid not null,

  -- platform-agnostic identity
  platform              text not null,
  posted_url            text,
  posted_video_id       text,

  -- performance at capture time (platform-varying metrics live here)
  -- YouTube: { views, avgViewPct, relativeRetention, subsGained, subsLost, trafficAlgorithmPct }
  performance_snapshot  jsonb not null default '{}'::jsonb,

  -- normalized, queryable trio (denormalized out of the blob for grounding SQL + cross-platform trends)
  primary_metric        bigint,
  channel_baseline      bigint,
  performance_multiple  numeric,
  video_age_days        int,
  outcome_verdict       text not null default 'pending'
    check (outcome_verdict in ('overperformed','on_par','underperformed','pending','not_posted')),

  captured_at           timestamptz not null default now(),
  capture_source        text not null default 'cache'
);

create index if not exists idea_outcomes_idea    on idea_outcomes (idea_id, captured_at desc);
create index if not exists idea_outcomes_user     on idea_outcomes (user_id, platform);
create index if not exists idea_outcomes_verdict  on idea_outcomes (user_id, outcome_verdict);
