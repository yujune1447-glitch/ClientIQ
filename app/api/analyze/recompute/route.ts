import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import {
  buildSummary,
  computeHookAnalysis,
  computeRetentionAnalysis,
  computeGrowthAnalysis,
  computeAudienceAnalysis,
  type ScoredResult,
} from "@/lib/process";
import { generateContentBrief } from "@/lib/claude";
import { analyzeComments } from "@/lib/comment-intelligence";
import { saveSnapshot } from "@/lib/snapshot";
import type {
  VideoWithScore,
  ChannelSummary,
  RawVideo,
  InstagramSummary,
  TikTokSummary,
} from "@/types";
import type { VideoRetentionSubs, TrafficSources, DemographicPoint } from "@/lib/youtube-analytics";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const userId = request.cookies.get("user_id")?.value;
  if (!userId) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const supabase = createAdminClient();

  // ── Load channel connection (for channelId only — no API calls) ──────────
  const { data: conn } = await supabase
    .from("youtube_connections")
    .select("channel_id, channel_title, channel_handle, channel_thumbnail")
    .eq("user_id", userId)
    .single();

  if (!conn) return NextResponse.json({ error: "no_youtube_connection" }, { status: 400 });

  // ── Load latest analysis — the raw material for recompute ────────────────
  const { data: latestAnalysis } = await supabase
    .from("analyses")
    .select("id, raw_videos, summary, instagram_summary, tiktok_summary")
    .eq("channel_id", conn.channel_id)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestAnalysis?.raw_videos || !latestAnalysis?.summary) {
    return NextResponse.json({ error: "no_cache" }, { status: 404 });
  }

  console.log("[recompute] Starting DB-only recompute. analysis_id=%s user_id=%s", latestAnalysis.id, userId);

  const existingSummary = latestAnalysis.summary as ChannelSummary;
  const rawVideos = latestAnalysis.raw_videos as RawVideo[];
  const igSummary = (latestAnalysis.instagram_summary ?? null) as InstagramSummary | null;
  const tikTokSummary = (latestAnalysis.tiktok_summary ?? null) as TikTokSummary | null;

  // ── Reconstruct allScored from cached summary ─────────────────────────────
  // New analyses carry summary.allVideos (full sorted VideoWithScore list).
  // Old analyses fall back to the union of top/bottom/outliers/recent — good enough
  // for small channels and for the correctness-sensitive operations.
  let allScored: VideoWithScore[];
  if (existingSummary.allVideos?.length) {
    allScored = existingSummary.allVideos;
    console.log(`[recompute] Using stored allVideos (${allScored.length} videos)`);
  } else {
    const seen = new Set<string>();
    const pool: VideoWithScore[] = [];
    for (const v of [
      ...(existingSummary.outliers ?? []),
      ...(existingSummary.topPerformers ?? []),
      ...(existingSummary.bottomPerformers ?? []),
      ...(existingSummary.recentVideos ?? []),
    ]) {
      if (!seen.has(v.id)) { seen.add(v.id); pool.push(v); }
    }
    allScored = pool.sort((a, b) => b.viewCount - a.viewCount);
    console.log(`[recompute] Fallback: reconstructed allScored from summary pools (${allScored.length}/${existingSummary.totalVideosAnalysed} videos)`);
  }

  // ── Reconstruct commentsMap from stored topComments on performers ─────────
  const commentsMap = new Map<string, { text: string; author: string }[]>();
  for (const v of [
    ...(existingSummary.topPerformers ?? []),
    ...(existingSummary.bottomPerformers ?? []),
  ]) {
    if (v.topComments?.length) {
      commentsMap.set(v.id, v.topComments.map((text, i) => ({
        text,
        author: v.topCommentAuthors?.[i] ?? "Unknown",
      })));
    }
  }

  // ── Reconstruct analyticsMap from allScored (already has averageView* fields) ─
  // scoreVideos() stored these fields on VideoWithScore at analysis time.
  // We re-use them to avoid any API call.
  const analyticsMapForScore = new Map(
    allScored.map((v) => [v.id, {
      averageViewDuration: v.averageViewDuration ?? 0,
      averageViewPercentage: v.averageViewPercentage ?? 0,
      impressions: v.impressions ?? 0,
      ctr: v.ctr ?? 0,
    }])
  );

  // Reconstruct ScoredResult without calling scoreVideos (no API calls needed)
  const scoredResult: ScoredResult = {
    scored: allScored,
    averages: existingSummary.averages,
    outliers: existingSummary.outliers ?? [],
    dateRange: existingSummary.dateRange,
  };

  // ── Rebuild channel info from stored summary + connection ─────────────────
  const channelInfo = {
    ...existingSummary.channel,
    id: conn.channel_id,
    title: conn.channel_title,
    handle: conn.channel_handle ?? existingSummary.channel.handle ?? "",
    thumbnail: conn.channel_thumbnail ?? existingSummary.channel.thumbnail ?? "",
  };

  // ── Read ALL video_analytics rows for this channel from DB ────────────────
  // This is the only source of truth for retention/subs/traffic/captions in recompute.
  const videoIds = allScored.map((v) => v.id);
  const { data: analyticsRows } = await supabase
    .from("video_analytics")
    .select("video_id, relative_retention, subs_gained, subs_lost, traffic_sources, caption_status, caption_text")
    .eq("channel_id", conn.channel_id)
    .eq("user_id", userId)
    .in("video_id", videoIds.slice(0, 1000)); // Supabase IN limit safety

  const retentionSubsMap = new Map<string, VideoRetentionSubs>();
  const trafficMap = new Map<string, TrafficSources>();
  const captionDataMap = new Map<string, { status: string; text: string | null }>();

  for (const row of analyticsRows ?? []) {
    if (row.subs_gained !== null) {
      retentionSubsMap.set(row.video_id, {
        relativeRetention: row.relative_retention ?? null,
        subsGained: row.subs_gained ?? 0,
        subsLost: row.subs_lost ?? 0,
      });
    }
    if (row.traffic_sources) {
      trafficMap.set(row.video_id, row.traffic_sources as TrafficSources);
    }
    if (row.caption_status) {
      captionDataMap.set(row.video_id, {
        status: row.caption_status,
        text: row.caption_text ?? null,
      });
    }
  }

  // ── Load channel demographics from DB ────────────────────────────────────
  const { data: demoRow } = await supabase
    .from("channel_demographics")
    .select("demographics")
    .eq("channel_id", conn.channel_id)
    .eq("user_id", userId)
    .maybeSingle();
  const demographics = (demoRow?.demographics ?? null) as DemographicPoint[] | null;

  console.log(`[recompute] DB rows loaded: retention=${retentionSubsMap.size} traffic=${trafficMap.size} captions=${captionDataMap.size} demographics=${demographics?.length ?? 0}`);

  // ── Build fresh summary (pure computation — no API calls) ─────────────────
  // buildSummary re-derives all title/duration/successPatterns from scored videos.
  // It uses commentsMap to re-attach stored comments to performers.
  const summary = buildSummary(scoredResult, commentsMap, channelInfo);

  // ── Compute all three analysis layers ─────────────────────────────────────
  if (summary.successPatterns) {
    summary.successPatterns.hookAnalysis = computeHookAnalysis(
      summary.topPerformers,
      summary.bottomPerformers,
      captionDataMap,
    );

    const relRetentionMap = new Map<string, number | null>(
      [...retentionSubsMap.entries()].map(([id, d]) => [id, d.relativeRetention])
    );
    summary.successPatterns.retentionAnalysis = computeRetentionAnalysis(
      summary.topPerformers,
      summary.bottomPerformers,
      allScored,
      relRetentionMap,
    );
    summary.successPatterns.growthAnalysis = computeGrowthAnalysis(
      summary.topPerformers,
      summary.bottomPerformers,
      allScored,
      retentionSubsMap,
      trafficMap,
      summary.successPatterns.retentionAnalysis,
    );
  }

  console.log("[recompute] Summary rebuilt: topPerformers=%d bottomPerformers=%d allVideos=%d",
    summary.topPerformers.length, summary.bottomPerformers.length, summary.allVideos?.length ?? 0);

  // ── Comment intelligence (Claude API — not googleapis) ────────────────────
  let commentIntelligence;
  try {
    commentIntelligence = await analyzeComments(summary, tikTokSummary, igSummary);
  } catch (err) {
    console.error("[recompute] analyzeComments failed (non-fatal):", err instanceof Error ? err.message : err);
    commentIntelligence = {
      totalCommentsAnalysed: 0, themes: [], videoIdeas: [],
      emotionalSignals: { excited: 0, grateful: 0, curious: 0, confused: 0, critical: 0, requesting: 0 },
      sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 },
      audiencePersonas: [], topCommenters: [],
      keyInsight: "", generatedAt: new Date().toISOString(),
    };
  }

  // Audience analysis — uses demographics (from DB) + commentIntelligence (just computed)
  if (summary.successPatterns) {
    summary.successPatterns.audienceAnalysis = computeAudienceAnalysis(demographics, commentIntelligence);
  }

  // ── Brief generation (Claude API — not googleapis) ────────────────────────
  let brief, autopsy;
  try {
    ({ brief, autopsy } = await generateContentBrief(summary, null, igSummary, tikTokSummary, commentIntelligence));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Brief generation failed";
    console.error("[recompute] generateContentBrief failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // ── Persist the recomputed summary back to the latest analysis row ────────
  // We UPDATE (not insert) so the analysis ID stays stable.
  const { error: updateErr } = await supabase
    .from("analyses")
    .update({
      summary,
      brief,
      autopsy,
      comment_intelligence: commentIntelligence,
    })
    .eq("id", latestAnalysis.id);

  if (updateErr) {
    console.error("[recompute] Failed to persist recomputed summary:", updateErr.message);
    return NextResponse.json({ error: "db_write_failed" }, { status: 500 });
  }

  await saveSnapshot({
    userId,
    channelId: conn.channel_id,
    analysisId: latestAnalysis.id,
    summary,
    rawVideos,
    commentIntelligence,
  });

  console.log("[recompute] Done. analysis_id=%s quota_used=0 (zero googleapis calls)", latestAnalysis.id);

  // Sanity assertion: none of the googleapis.com domains were contacted in this path.
  // All data reads: Supabase DB only. All writes: Supabase DB only.
  // Claude API (anthropic.com) is used for analyzeComments + generateContentBrief — these are intentional.
  return NextResponse.json({ analysisId: latestAnalysis.id, quotaUsed: 0 });
}
