alter table analyses add column if not exists comment_intelligence jsonb;

alter table channel_snapshots add column if not exists comment_sentiment jsonb;
