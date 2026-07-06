# Feedback Loop: "Did this idea get made, and how did it perform?"

**Status:** Plan for review. No code yet — schema sign-off required before building.
**Design goal:** When a saved idea reaches **Done**, capture whether it was actually posted and pull its real performance from data we already cache, then feed that outcome back into **Planning Content** grounding. This becomes the proprietary "which of *our* ideas actually worked" dataset — the moat competitors can't cold-start.

**Hard constraint:** Zero new YouTube API calls. Every metric here already lives in `analyses.raw_videos`, `analyses.summary.allVideos`, or `video_analytics`.

---

## 0. What we already have (grounding)

| Data | Where it lives today | Contains |
|---|---|---|
| Per-video views/likes/comments/duration | `analyses.raw_videos` (RawVideo[]) and `analyses.summary.allVideos` (VideoWithScore[]) | `viewCount`, `likeCount`, `commentCount`, `averageViewPercentage`, `averageViewDuration`, `ctr`, `publishedAt` |
| Per-video retention / subs / traffic | `video_analytics` (PK `video_id, channel_id`) | `relative_retention`, `subs_gained`, `subs_lost`, `traffic_sources` |
| Channel baseline | `summary.successPatterns.channelMedianViews`, `summary.averages` | median/avg views to grade against |
| The idea itself | `saved_ideas` | `title`, `hook`, `length`, `structure`, `why_it_works`, `status`, `source`, `platform` |
| Planning grounding builder | `buildPlanInitPrompt()` in `app/components/AnalysisContent.tsx:40` | assembles the `## Channel Performance Grounding` block |

**Key consequence:** resolving a posted video to its metrics is a **DB join**, not an API pull. If the video is in the latest analysis, capture costs 0 quota. If it's too new to be in the last pull, the existing incremental analyze picks it up on the next weekly run (also ~0 marginal quota) and we snapshot then.

---

## 1. SCHEMA

### Decision: linked table + denormalized pointer (not columns-only on `saved_ideas`)

Add **one new table** `idea_outcomes` (time-series capable, platform-agnostic) plus **three denormalized columns** on `saved_ideas` for cheap board rendering without a join.

```sql
-- Migration: 20260706000011_idea_outcomes.sql

-- Denormalized pointer on saved_ideas: lets the Kanban board show "shipped + verdict"
-- without joining. Nullable — an idea can be Done without being linked to a post.
alter table saved_ideas
  add column posted_url        text,
  add column posted_video_id   text,        -- platform-native id (YT videoId, later IG/TikTok media id)
  add column latest_outcome_id uuid,        -- points at newest idea_outcomes row
  add column outcome_verdict   text
    check (outcome_verdict in ('overperformed','on_par','underperformed','pending','not_posted'));

-- Time-series outcome captures. One idea can be captured multiple times as the
-- video matures (day 2 vs day 30), so history is a table, not a column.
create table if not exists idea_outcomes (
  id                    uuid primary key default gen_random_uuid(),
  idea_id               uuid not null references saved_ideas(id) on delete cascade,
  user_id               uuid not null references users(id) on delete cascade,

  -- ── platform-agnostic identity ──
  platform              text not null,              -- 'youtube' | 'instagram' | 'tiktok'
  posted_url            text,
  posted_video_id       text,                       -- native id on that platform

  -- ── performance at capture time (platform-varying → JSONB) ──
  -- YouTube: { views, avgViewPct, relativeRetention, subsGained, subsLost, trafficAlgorithmPct }
  -- Instagram (later): { reach, likes, saves, engagementRate }
  -- TikTok (later): { views, likes, completionRate, engagementRate }
  performance_snapshot  jsonb not null default '{}'::jsonb,

  -- ── common, queryable columns (denormalized out of the blob for grounding SQL) ──
  primary_metric        bigint,                     -- the platform's headline number: YT views, IG reach, TT views
  channel_baseline      bigint,                     -- channel median of primary_metric at capture time
  performance_multiple  numeric,                    -- primary_metric / channel_baseline
  video_age_days        int,                        -- age of the post when captured (maturity context)
  outcome_verdict       text not null default 'pending'
    check (outcome_verdict in ('overperformed','on_par','underperformed','pending','not_posted')),

  captured_at           timestamptz not null default now(),
  capture_source        text not null default 'cache'  -- 'cache' | 'manual' | 'analysis_refresh'
);

create index if not exists idea_outcomes_idea    on idea_outcomes (idea_id, captured_at desc);
create index if not exists idea_outcomes_user     on idea_outcomes (user_id, platform);
create index if not exists idea_outcomes_verdict  on idea_outcomes (user_id, outcome_verdict);
```

**Why this shape hits the platform-agnostic requirement:**
- `platform`, `posted_url`, `posted_video_id` are on both tables and carry no YouTube assumptions.
- `performance_snapshot` (JSONB) absorbs the metrics that differ per platform (YT retention has no IG analog; IG saves have no YT analog).
- `primary_metric` / `channel_baseline` / `performance_multiple` are the **normalized** cross-platform trio the AI grounding and future cross-platform trend work can query uniformly — "this idea did 2.1× baseline" means the same thing on any platform.
- `video_age_days` is stored so we never mistake "new video hasn't accumulated views" for "idea flopped."

**Why time-series (table) not one-shot (columns):** a video captured 2 days after posting looks like a flop; the same video at 30 days may be a hit. Keeping `idea_outcomes` as history lets a later `analysis_refresh` add a fresher row and re-grade the verdict, while `saved_ideas.latest_outcome_id` always points at the newest. If we later decide we only ever want the latest, the denormalized columns on `saved_ideas` already cover the board — the history table is purely additive.

---

## 2. CAPTURE UX — one lightweight step

Triggered at the **Done** transition in `SavedIdeasBoard.tsx` (the `moveStatus(idea.id, "done")` handler, currently `SavedIdeasBoard.tsx:145`).

**Flow:** clicking **✓ Done** still moves the card immediately (no blocking). A slim inline prompt appears on the now-Done card: *"Did you post this? Link it →"*. Clicking opens a small popover with two ways to link, whichever the creator prefers:

1. **Paste URL** — one text field. Paste the YouTube watch/share/Shorts URL, hit Link.
2. **Pick from recent uploads** — a dropdown of the channel's last ~15 videos, read straight from `summary.allVideos` (already in the client's `AnalysisData` — **zero fetch, zero quota**). Fastest path when the video is already in the last analysis.

A third implicit state: **"Didn't make it"** — dismiss the prompt, sets `outcome_verdict = 'not_posted'`. That's still signal (which ideas never shipped).

**Principles:**
- Never blocks the Done move. Linking is optional and can be done later from the card's detail modal.
- The card visibly upgrades once linked: shows the verdict chip ("2.1× median ✓" / "underperformed" / "pending — too new").
- No new page. Popover + one existing modal.

---

## 3. MATCHING — pasted URL → video_id → cached metrics

**Step A — parse.** Extract `video_id` from any YouTube URL form (`watch?v=`, `youtu.be/`, `/shorts/`) with a regex. Pure string work.

**Step B — verify ownership (anti-pollution).** Look up `video_id` in the latest analysis's `raw_videos` / `summary.allVideos` for this user's `channel_id`.
- **Found** → it's genuinely their video. Proceed to snapshot.
- **Not found** → do **not** silently accept it (prevents linking a competitor's viral video and poisoning the proprietary dataset). Show: *"We don't see this on your channel yet — it'll link automatically after your next analysis."* Store the link with `outcome_verdict = 'pending'` and `posted_video_id` set, so the next analysis refresh (§5) can complete it.

**Step C — snapshot from cache (0 API calls).** Assemble `performance_snapshot` by joining what we already store:
- `views`, `avgViewPct`, `publishedAt` ← `summary.allVideos` (VideoWithScore) or `raw_videos`.
- `relativeRetention`, `subsGained`, `subsLost`, `trafficAlgorithmPct` ← `video_analytics` row for `(video_id, channel_id)`.
- `primary_metric = views`; `channel_baseline = summary.successPatterns.channelMedianViews`; `performance_multiple = views / baseline`.
- `video_age_days = now − publishedAt`.

**Step D — verdict.** See §4 baseline note. Default thresholds: `≥1.25×` → overperformed, `0.75–1.25×` → on_par, `<0.75×` → underperformed; force `pending` when `video_age_days < 14` (not enough accumulation to judge fairly).

Everything in B–D reads DB rows already present. No `googleapis` call anywhere in the capture path.

---

## 4. FEEDBACK INTO AI — inject outcomes into `buildPlanInitPrompt`

Target: the `## Channel Performance Grounding` block assembled in `buildPlanInitPrompt()` (`AnalysisContent.tsx:40`). Add a new grounded section **"Ideas you actually shipped"** between "Proven patterns" and "Audience-requested topics."

**Aggregation (computed from `idea_outcomes` joined to `saved_ideas`):** group shipped ideas by the pattern they used — reuse the existing title-category / hook-cluster classifiers already in `AnalysisContent.tsx` (`extractTitleCategories`, `extractHookClusters`) so "pattern" means the same thing here as in the rest of the analysis. For each pattern with n ≥ 2 shipped ideas, emit the median `performance_multiple`.

**Rendered grounding lines (example):**
```
Ideas you actually shipped (your proprietary track record):
• Ideas you made using the question-title format hit 2.1× your channel median (n=3, e.g. "Why I quit...").
• Ideas using the listicle format underperformed — 0.6× median (n=2). Deprioritize unless the topic is strong.
• 4 ideas marked Done were never posted — not counted above.
```

Plus a one-line instruction so the model *uses* it: *"When suggesting concepts, prefer patterns from 'Ideas you actually shipped' that overperformed, and avoid ones that underperformed. Cite the track record as evidence."*

**Plumbing decision (flagged in §7):** `buildPlanInitPrompt` is client-side and only receives `summary` + `commentIntel`. Two options to get outcomes to it:
- **(A)** Compute an `ideaTrackRecord` aggregate during the analyze/recompute build and stash it on `summary` (survives the existing caching, shows up wherever `summary` is read). Recommended.
- **(B)** A dedicated `/api/ideas/track-record` fetched client-side when the Planning tab opens. More real-time, one extra request.

Recommend **(A)** — it rides the existing recompute path (§5) at zero extra cost and keeps grounding assembly synchronous.

---

## 5. QUOTA — reuses cache, no regression

The quota problem we already solved (incremental video details, never re-fetching captions, `QuotaBudget` guard in `app/api/analyze/route.ts`) is **not** reintroduced:

- **Capture (§3)** reads `analyses` + `video_analytics` rows only. `googleapis` unit cost = **0**.
- **"Pick from recent uploads" (§2)** reads `summary.allVideos` already in the client. Cost = **0**.
- **Refresh of linked outcomes** piggybacks on the existing analyze/recompute run. When a scheduled/manual analysis completes, add a post-step that re-snapshots any `saved_ideas` with a `posted_video_id` for that channel, writing a fresh `idea_outcomes` row from the just-rebuilt `summary` + `video_analytics`. This runs **after** the data is already in memory — **0 additional** `googleapis` calls. The recompute route (`app/api/analyze/recompute/route.ts`) is explicitly a "zero googleapis calls" path and stays that way.
- **Pending links** (video too new to be in last pull) resolve naturally: the next incremental analyze already fetches new uploads (playlistItems 1 unit/page + incremental video details), so the video enters the cache with no capture-specific pull. We just read it on the following refresh.

**Net new quota surface: none.** Every read is Supabase; Claude (anthropic.com) is only touched by the already-existing Planning chat.

---

## 6. PHASING — 3 independently-verifiable steps

### Phase 1 — Schema + capture (link & snapshot from cache)
- Migration `20260706000011_idea_outcomes.sql` (§1).
- `POST /api/ideas/[id]/outcome` — parse URL, verify ownership, snapshot from cache, write `idea_outcomes` + denormalize onto `saved_ideas`.
- Capture popover in `SavedIdeasBoard.tsx` (paste URL + pick-from-recent).
- **Verify:** mark an idea Done, link a real cached video, confirm an `idea_outcomes` row appears with correct `views`/`performance_multiple` and the card shows a verdict chip. Link a non-channel URL → confirm it's held as `pending`, not accepted. Zero network calls to googleapis (check logs).

### Phase 2 — Verdict + refresh-on-analysis
- Verdict computation with the maturity guard (§3 Step D).
- Post-analysis refresh step (§5) that re-snapshots linked ideas during analyze/recompute and completes `pending` links once their video enters cache.
- **Verify:** link a <14-day video → `pending`; run a re-analyze after it matures (or backdate in a test row) → new `idea_outcomes` row, verdict flips to graded. Confirm recompute still reports `quota_used=0`.

### Phase 3 — Feedback into Planning grounding
- `ideaTrackRecord` aggregate on `summary` (option A, §4) + new grounding section in `buildPlanInitPrompt`.
- **Verify:** with ≥2 shipped ideas of one pattern, open Planning Content → the opening message cites the shipped-idea track record ("ideas like X you made got 2.1×…") and steers suggestions toward overperforming patterns.

Each phase ships and is testable on its own; Phase 1 delivers the dataset even before the AI uses it.

---

## 7. Schema decisions where I want your input

1. **Linked table vs columns-only.** I recommend the `idea_outcomes` history table + denormalized pointer on `saved_ideas` (§1), because a video's performance changes as it matures and we'll want to re-grade. The cost is one extra table and a join for history views. If you'd rather keep it dead-simple and only ever store the *latest* snapshot, we can drop the table and put `performance_snapshot jsonb` + the common columns directly on `saved_ideas`. **This is the main one to decide before I build.**

2. **Verdict baseline — all-time median vs age-adjusted.** Grading a 5-day-old video against the channel's all-time median is unfair (it hasn't accumulated views). My default is a hard `pending` under 14 days + storing `video_age_days`. A stronger-but-more-complex option: compare against the median of *similarly-aged* videos at the same age. Simple maturity-gate now, age-adjusted later? Or build age-adjusted from the start?

3. **JSONB blob vs fully typed metrics.** I split the difference: platform-varying metrics in `performance_snapshot` JSONB, plus a normalized `primary_metric`/`channel_baseline`/`performance_multiple` trio as real columns for grounding SQL and future cross-platform trend queries. Confirm you're happy carrying both, vs. going all-JSONB (simpler writes, harder queries).

4. **FK / RLS pattern.** `saved_ideas` uses `user_id uuid` (no FK) accessed via the service-role admin client; `video_analytics` instead references `auth.users(id)` with RLS on `auth.uid()` — but this app authenticates via Google OAuth into a custom `users` table, not Supabase Auth, so that `auth.users` FK is effectively dead. I'll follow the **`saved_ideas` pattern** (`references users(id)`, service-role access) for `idea_outcomes` for consistency. Flag if you want the opposite.

5. **Ownership strictness.** I gate linking on the video existing in the channel's cached uploads (§3 Step B) to keep the proprietary dataset clean. Downside: a legitimately just-posted video can't be *fully* linked until the next analysis (held as `pending`). Acceptable, or do you want to allow an immediate manual snapshot the creator types in?
