-- per-video analytics signals (retention, subs, traffic, captions, retention curve)
CREATE TABLE video_analytics (
  video_id          TEXT        NOT NULL,
  channel_id        TEXT        NOT NULL,
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Signal A: relative retention + subscriber delta
  relative_retention  NUMERIC,
  subs_gained         INTEGER,
  subs_lost           INTEGER,

  -- Signal B: traffic source breakdown {BROWSE: n, SEARCH: n, SUGGESTED: n, ...}
  traffic_sources     JSONB,

  -- Signal D: retention curve, fetched on-demand only
  retention_curve     JSONB,
  curve_fetched_at    TIMESTAMPTZ,

  -- Signal E: first-15s caption text
  caption_status    TEXT CHECK (caption_status IN ('fetched', 'unavailable', 'failed')),
  caption_text      TEXT,
  caption_lang      TEXT,

  fetched_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (video_id, channel_id)
);

CREATE INDEX ON video_analytics (channel_id, user_id);
CREATE INDEX ON video_analytics (channel_id) WHERE caption_status IS NULL;

ALTER TABLE video_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_video_analytics" ON video_analytics
  FOR ALL USING (user_id = auth.uid());

-- channel-level age+gender viewer percentage breakdown
CREATE TABLE channel_demographics (
  channel_id    TEXT NOT NULL,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  demographics  JSONB NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (channel_id, user_id)
);

ALTER TABLE channel_demographics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_demographics" ON channel_demographics
  FOR ALL USING (user_id = auth.uid());
