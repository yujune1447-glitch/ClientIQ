-- Exact weekly subscriber movement from the YouTube Analytics API (subscribersGained/Lost
-- over the last 7 days). Stored on the analysis so the dashboard reads it with no live call.
-- Public channels.list subscriberCount is rounded (nearest 1,000 at 125K+), which made
-- week-over-week growth invisible; these are exact and on the separate Analytics quota.
alter table analyses
  add column if not exists weekly_subs_gained int,
  add column if not exists weekly_subs_lost   int;
