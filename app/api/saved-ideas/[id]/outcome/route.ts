import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import type { ChannelSummary, VideoWithScore, RawVideo } from "@/types";

// Zero googleapis calls: every metric here is read from cached DB rows
// (analyses.raw_videos / analyses.summary.allVideos / video_analytics).

const MATURITY_GATE_DAYS = 14;
const OVER = 1.25;
const UNDER = 0.75;

// Traffic sources that count as YouTube-algorithm-driven (mirrors lib/process.ts groupings).
const ALGORITHM_SOURCES = new Set(["BROWSE_FEATURES", "SUGGESTED_VIDEOS", "RELATED_VIDEO"]);

function parseYouTubeId(input: string): string | null {
  const s = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /\/shorts\/([a-zA-Z0-9_-]{11})/,
    /\/embed\/([a-zA-Z0-9_-]{11})/,
    /\/live\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = s.match(p);
    if (m) return m[1];
  }
  return null;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function algorithmPct(traffic: Record<string, number> | null): number | null {
  if (!traffic) return null;
  let algo = 0;
  let total = 0;
  for (const [k, v] of Object.entries(traffic)) {
    total += v;
    if (ALGORITHM_SOURCES.has(k)) algo += v;
  }
  return total > 0 ? Math.round((algo / total) * 100) : null;
}

function verdictFor(multiple: number, ageDays: number): string {
  if (ageDays < MATURITY_GATE_DAYS) return "pending";
  if (multiple >= OVER) return "overperformed";
  if (multiple >= UNDER) return "on_par";
  return "underperformed";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = request.cookies.get("user_id")?.value;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: ideaId } = await params;
  const body = await request.json().catch(() => ({}));
  const supabase = createAdminClient();

  // ── Confirm the idea belongs to this user ────────────────────────────────
  const { data: idea, error: ideaErr } = await supabase
    .from("saved_ideas")
    .select("id, platform")
    .eq("id", ideaId)
    .eq("user_id", userId)
    .single();

  if (ideaErr || !idea) return NextResponse.json({ error: "Idea not found" }, { status: 404 });

  // ── "Didn't make it" — dismissal is still signal ─────────────────────────
  if (body.not_posted === true) {
    const { data: updated, error } = await supabase
      .from("saved_ideas")
      .update({ outcome_verdict: "not_posted", updated_at: new Date().toISOString() })
      .eq("id", ideaId)
      .eq("user_id", userId)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ idea: updated, outcome: null });
  }

  // ── Resolve the video id (paste-URL or pick-from-recent) ─────────────────
  const rawInput: string | undefined = body.posted_video_id ?? body.posted_url;
  if (!rawInput || typeof rawInput !== "string") {
    return NextResponse.json({ error: "Provide posted_url or posted_video_id" }, { status: 400 });
  }

  if (idea.platform !== "youtube") {
    return NextResponse.json({ error: "Only YouTube capture is supported in Phase 1" }, { status: 400 });
  }

  const videoId = parseYouTubeId(rawInput);
  if (!videoId) {
    return NextResponse.json({ error: "Could not parse a YouTube video ID from that input" }, { status: 400 });
  }
  const postedUrl = body.posted_url ?? `https://youtube.com/watch?v=${videoId}`;

  // ── Load latest analysis (cache) for ownership verification + metrics ────
  const { data: latest } = await supabase
    .from("analyses")
    .select("channel_id, raw_videos, summary")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const summary = (latest?.summary ?? null) as ChannelSummary | null;
  const rawVideos = (latest?.raw_videos ?? []) as RawVideo[];
  const channelId = latest?.channel_id ?? null;

  const scored: VideoWithScore | undefined = summary?.allVideos?.find((v) => v.id === videoId);
  const raw: RawVideo | undefined = rawVideos.find((v) => v.id === videoId);
  const onChannel = !!scored || !!raw;

  // ── Not on channel yet → hold as pending (Phase 2 resolves on next analysis) ─
  if (!onChannel) {
    const outcome = await writeOutcome(supabase, {
      ideaId,
      userId,
      platform: "youtube",
      postedUrl,
      postedVideoId: videoId,
      performanceSnapshot: {},
      primaryMetric: null,
      channelBaseline: null,
      performanceMultiple: null,
      videoAgeDays: null,
      verdict: "pending",
      captureSource: "cache",
    });
    if ("error" in outcome) return NextResponse.json({ error: outcome.error }, { status: 500 });
    return NextResponse.json({
      idea: outcome.idea,
      outcome: outcome.row,
      note: "This video isn't on your channel yet — it'll grade automatically after your next analysis.",
    });
  }

  // ── Snapshot from cache ──────────────────────────────────────────────────
  const views = scored?.viewCount ?? parseInt(raw?.statistics.viewCount ?? "0");
  const avgViewPct = scored?.averageViewPercentage ?? null;
  const publishedAt = scored?.publishedAt ?? raw?.snippet.publishedAt ?? null;
  const videoAgeDays = publishedAt
    ? Math.floor((Date.now() - new Date(publishedAt).getTime()) / 86_400_000)
    : 0;

  // video_analytics row (retention / subs / traffic) for this video
  let relativeRetention: number | null = null;
  let subsGained: number | null = null;
  let subsLost: number | null = null;
  let trafficAlgorithmPct: number | null = null;
  if (channelId) {
    const { data: va } = await supabase
      .from("video_analytics")
      .select("relative_retention, subs_gained, subs_lost, traffic_sources")
      .eq("video_id", videoId)
      .eq("channel_id", channelId)
      .maybeSingle();
    if (va) {
      relativeRetention = va.relative_retention ?? null;
      subsGained = va.subs_gained ?? null;
      subsLost = va.subs_lost ?? null;
      trafficAlgorithmPct = algorithmPct((va.traffic_sources ?? null) as Record<string, number> | null);
    }
  }

  // Channel baseline: all-time median views (successPatterns → allVideos → averages fallback)
  const baseline =
    summary?.successPatterns?.channelMedianViews ||
    (summary?.allVideos?.length ? Math.round(median(summary.allVideos.map((v) => v.viewCount))) : 0) ||
    summary?.averages.views ||
    0;

  const performanceMultiple = baseline > 0 ? Math.round((views / baseline) * 100) / 100 : null;
  const verdict = performanceMultiple !== null ? verdictFor(performanceMultiple, videoAgeDays) : "pending";

  const performanceSnapshot: Record<string, unknown> = {
    views,
    avgViewPct,
    relativeRetention,
    subsGained,
    subsLost,
    trafficAlgorithmPct,
  };

  const outcome = await writeOutcome(supabase, {
    ideaId,
    userId,
    platform: "youtube",
    postedUrl,
    postedVideoId: videoId,
    performanceSnapshot,
    primaryMetric: views,
    channelBaseline: baseline || null,
    performanceMultiple,
    videoAgeDays,
    verdict,
    captureSource: "cache",
  });
  if ("error" in outcome) return NextResponse.json({ error: outcome.error }, { status: 500 });

  return NextResponse.json({ idea: outcome.idea, outcome: outcome.row });
}

interface WriteArgs {
  ideaId: string;
  userId: string;
  platform: string;
  postedUrl: string;
  postedVideoId: string;
  performanceSnapshot: Record<string, unknown>;
  primaryMetric: number | null;
  channelBaseline: number | null;
  performanceMultiple: number | null;
  videoAgeDays: number | null;
  verdict: string;
  captureSource: string;
}

async function writeOutcome(
  supabase: ReturnType<typeof createAdminClient>,
  a: WriteArgs,
): Promise<{ row: unknown; idea: unknown } | { error: string }> {
  const { data: row, error: outErr } = await supabase
    .from("idea_outcomes")
    .insert({
      idea_id: a.ideaId,
      user_id: a.userId,
      platform: a.platform,
      posted_url: a.postedUrl,
      posted_video_id: a.postedVideoId,
      performance_snapshot: a.performanceSnapshot,
      primary_metric: a.primaryMetric,
      channel_baseline: a.channelBaseline,
      performance_multiple: a.performanceMultiple,
      video_age_days: a.videoAgeDays,
      outcome_verdict: a.verdict,
      capture_source: a.captureSource,
    })
    .select()
    .single();

  if (outErr || !row) return { error: outErr?.message ?? "Failed to write outcome" };

  const { data: idea, error: ideaErr } = await supabase
    .from("saved_ideas")
    .update({
      posted_url: a.postedUrl,
      posted_video_id: a.postedVideoId,
      latest_outcome_id: row.id,
      outcome_verdict: a.verdict,
      updated_at: new Date().toISOString(),
    })
    .eq("id", a.ideaId)
    .eq("user_id", a.userId)
    .select()
    .single();

  if (ideaErr || !idea) return { error: ideaErr?.message ?? "Failed to update idea" };
  return { row, idea };
}
