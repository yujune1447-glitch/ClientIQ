import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import {
  refreshAccessToken,
  getChannelInfo,
  getAllVideoIds,
  getVideoDetails,
  getChannelAnalytics,
  fetchCommentsParallel,
} from "@/lib/youtube";
import {
  fetchRetentionSubsBatch,
  fetchTrafficBatch,
  fetchDemographics,
  type VideoRetentionSubs,
  type TrafficSources,
} from "@/lib/youtube-analytics";
import { fetchCaption } from "@/lib/captions";
import { scoreVideos, buildSummary, computeHookAnalysis, computeRetentionAnalysis, computeGrowthAnalysis, computeAudienceAnalysis } from "@/lib/process";
import { generateContentBrief } from "@/lib/claude";
import { analyzeComments } from "@/lib/comment-intelligence";
import { searchNicheVideoIds, getNicheVideoDetails, processNicheData } from "@/lib/niche";
import { saveSnapshot } from "@/lib/snapshot";
import { fetchInstagramData, refreshPageToken } from "@/lib/instagram";
import { fetchTikTokData, refreshTikTokToken } from "@/lib/tiktok";
import { QuotaBudget } from "@/lib/quota";
import type { YouTubeChannel, NicheSummary, InstagramSummary, TikTokSummary, RawVideo } from "@/types";

export const maxDuration = 300;

// Configurable via env — change without code deploy
const QUOTA_BUDGET     = parseInt(process.env.QUOTA_BUDGET            ?? "8000");
const STALE_ANALYTICS_DAYS = parseInt(process.env.STALE_ANALYTICS_DAYS ?? "7");
const VIDEO_STALE_DAYS     = parseInt(process.env.VIDEO_STALE_DAYS     ?? "30");

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (payload: Record<string, unknown>) => {
        if (request.signal.aborted) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      try {
        // ── Auth + connections ─────────────────────────────────────────────
        const userId = request.cookies.get("user_id")?.value;
        console.log("[analyze] Request received. user_id_from_cookie=%s", userId ?? "MISSING");
        if (!userId) { emit({ event: "error", message: "Not authenticated" }); return; }

        const forceRefresh = request.nextUrl.searchParams.get("force") === "true";
        const quota = new QuotaBudget(QUOTA_BUDGET);

        if (forceRefresh) {
          console.log("[analyze] Force-refresh mode — all caches bypassed");
        }

        const supabase = createAdminClient();

        const [{ data: conn, error: connErr }, { data: userData }, { data: igConn }, { data: ttConn }] = await Promise.all([
          supabase.from("youtube_connections").select("*").eq("user_id", userId).single(),
          supabase.from("users").select("niche").eq("id", userId).single(),
          supabase.from("instagram_connections").select("*").eq("user_id", userId).maybeSingle(),
          supabase.from("tiktok_connections").select("*").eq("user_id", userId).maybeSingle(),
        ]);

        console.log("[analyze] DB lookup: conn_found=%s conn_err=%s refresh_token_present=%s token_expires_at=%s",
          !!conn, connErr?.message ?? "none", !!conn?.refresh_token, conn?.token_expires_at ?? "null");

        if (!conn) {
          console.error("[analyze] No YouTube connection for user_id=%s. connErr=%j", userId, connErr);
          emit({ event: "error", message: "No YouTube connection found" });
          return;
        }
        const niche: string | null = userData?.niche ?? null;

        let accessToken: string = conn.access_token;
        let tokenExpiresAt: Date = new Date(conn.token_expires_at ?? 0);

        console.log("[analyze] Token status: expires_at=%s is_expired=%s",
          tokenExpiresAt.toISOString(), tokenExpiresAt <= new Date());

        const maybeRefresh = async () => {
          if (tokenExpiresAt <= new Date()) {
            console.log("[analyze] Access token expired — attempting refresh. refresh_token_present=%s", !!conn.refresh_token);
            if (!conn.refresh_token) {
              console.error("[analyze] No refresh_token stored — cannot refresh. needs_reauth.");
              emit({ event: "error", message: "needs_reauth" });
              throw new Error("needs_reauth");
            }
            try {
              const refreshed = await refreshAccessToken(conn.refresh_token);
              accessToken = refreshed.accessToken;
              tokenExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000);
              console.log("[analyze] Token refreshed OK. new_expires_at=%s", tokenExpiresAt.toISOString());
              const { error: updateErr } = await supabase.from("youtube_connections").update({
                access_token: accessToken,
                token_expires_at: tokenExpiresAt.toISOString(),
              }).eq("id", conn.id);
              if (updateErr) {
                console.error("[analyze] Failed to persist refreshed token to DB: %j — will continue with in-memory token", updateErr);
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.error("[analyze] refreshAccessToken FAILED: %s — emitting needs_reauth", msg);
              emit({ event: "error", message: "needs_reauth" });
              throw new Error("needs_reauth");
            }
          } else {
            console.log("[analyze] Token still valid, skipping refresh.");
          }
        };

        await maybeRefresh();
        quota.charge("channels.list");
        emit({ event: "step_done", step: "connect" });

        // ── Load previous raw_videos for incremental video-details fetch ───
        // Only video details for new uploads + recently published need refreshing.
        // Old stable videos reuse the last analysis's cached data (0 quota cost).
        const prevRawVideoMap = new Map<string, RawVideo>();
        if (!forceRefresh) {
          const { data: prevAnalysis } = await supabase
            .from("analyses")
            .select("raw_videos")
            .eq("channel_id", conn.channel_id)
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (prevAnalysis?.raw_videos) {
            for (const v of prevAnalysis.raw_videos as RawVideo[]) {
              prevRawVideoMap.set(v.id, v);
            }
            console.log(`[analyze] Loaded ${prevRawVideoMap.size} cached video details from previous analysis`);
          }
        }

        // ── Pull all video IDs (playlistItems.list, 1 unit/50-video page) ─
        // NOTE: playlistItems.list is already used here — NOT search.list (100 units/call).
        emit({ event: "step_start", step: "pull" });
        const channelStats = await getChannelInfo(accessToken);
        const videoIds = await getAllVideoIds(channelStats.uploadsPlaylistId, accessToken, (count) => {
          emit({ event: "videos_found", count });
        }, quota);

        // ── Incremental video details: only fetch new uploads + recent videos ─
        // Videos published > VIDEO_STALE_DAYS ago are stable; reuse cached details.
        const videoStaleCutoff = Date.now() - VIDEO_STALE_DAYS * 86_400_000;
        const idsToFetch: string[] = forceRefresh
          ? videoIds
          : videoIds.filter((id) => {
              const prev = prevRawVideoMap.get(id);
              if (!prev) return true; // new upload since last analysis
              return new Date(prev.snippet.publishedAt).getTime() > videoStaleCutoff;
            });

        const idsToFetchSet = new Set(idsToFetch);

        await maybeRefresh();
        const freshRawVideos = await getVideoDetails(idsToFetch, accessToken, (current, total) => {
          emit({ event: "details_progress", current, total });
        }, quota);

        // Merge: stale-but-valid cache + freshly fetched, maintaining playlist order
        const rawVideoMap = new Map<string, RawVideo>();
        for (const id of videoIds) {
          const prev = prevRawVideoMap.get(id);
          if (prev && !idsToFetchSet.has(id)) rawVideoMap.set(id, prev);
        }
        for (const v of freshRawVideos) rawVideoMap.set(v.id, v);
        const rawVideos = videoIds
          .map((id) => rawVideoMap.get(id))
          .filter((v): v is RawVideo => v !== undefined);

        const newVideoCount = videoIds.filter((id) => !prevRawVideoMap.has(id)).length;
        console.log(`[analyze] Video details: ${freshRawVideos.length} fetched, ${rawVideos.length - freshRawVideos.length} from cache, ${newVideoCount} new uploads`);
        emit({ event: "step_done", step: "pull" });

        // ── Channel Analytics (YouTube Analytics API — separate 200k/day quota) ─
        emit({ event: "step_start", step: "analytics" });
        await maybeRefresh();
        const analyticsMap = await getChannelAnalytics(accessToken, (page, total) => {
          emit({ event: "analytics_progress", page, total });
        });
        emit({ event: "step_done", step: "analytics" });

        // ── Niche intelligence (if niche set) ────────────────────────────
        let nicheSummary: NicheSummary | null = null;
        if (niche) {
          emit({ event: "step_start", step: "niche" });
          await maybeRefresh();
          const nicheIds = await searchNicheVideoIds(niche, accessToken);
          const nicheVideos = await getNicheVideoDetails(nicheIds, accessToken);
          nicheSummary = processNicheData(nicheVideos, niche);
          emit({ event: "step_done", step: "niche" });
        } else {
          emit({ event: "step_skip", step: "niche" });
        }

        // ── TikTok data (if connected) ───────────────────────────────────
        let tikTokSummary: TikTokSummary | null = null;
        if (ttConn) {
          emit({ event: "step_start", step: "tiktok" });
          try {
            let ttToken: string = ttConn.access_token;
            if (ttConn.token_expires_at && new Date(ttConn.token_expires_at) <= new Date()) {
              if (ttConn.refresh_token) {
                const refreshed = await refreshTikTokToken(ttConn.refresh_token);
                if (refreshed) {
                  ttToken = refreshed.access_token;
                  await supabase.from("tiktok_connections").update({
                    access_token: ttToken,
                    token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
                    refresh_token: refreshed.refresh_token,
                    refresh_token_expires_at: new Date(Date.now() + refreshed.refresh_expires_in * 1000).toISOString(),
                  }).eq("id", ttConn.id);
                }
              }
            }
            tikTokSummary = await fetchTikTokData(
              ttToken,
              ttConn.display_name ?? "",
              ttConn.follower_count ?? 0,
              ttConn.following_count ?? 0,
              ttConn.likes_count ?? 0,
              ttConn.video_count ?? 0,
              ttConn.avatar_url ?? "",
              (done, total) => emit({ event: "tiktok_progress", done, total })
            );
            emit({ event: "step_done", step: "tiktok" });
          } catch {
            emit({ event: "step_skip", step: "tiktok" });
          }
        } else {
          emit({ event: "step_skip", step: "tiktok" });
        }

        // ── Instagram data (if connected) ────────────────────────────────
        let igSummary: InstagramSummary | null = null;
        if (igConn) {
          emit({ event: "step_start", step: "instagram" });
          try {
            let igPageToken: string = igConn.page_access_token;
            if (igConn.token_expires_at && new Date(igConn.token_expires_at) <= new Date()) {
              const refreshed = await refreshPageToken(igConn.user_access_token);
              if (refreshed) {
                igPageToken = refreshed;
                await supabase.from("instagram_connections").update({
                  page_access_token: refreshed,
                  token_expires_at: new Date(Date.now() + 5184000 * 1000).toISOString(),
                }).eq("id", igConn.id);
              }
            }
            igSummary = await fetchInstagramData(
              igConn.ig_user_id,
              igPageToken,
              igConn.follower_count ?? 0,
              igConn.username ?? "",
              igConn.media_count ?? 0,
              igConn.profile_picture_url ?? "",
              (done, total) => emit({ event: "instagram_progress", done, total })
            );
            emit({ event: "step_done", step: "instagram" });
          } catch {
            emit({ event: "step_skip", step: "instagram" });
          }
        } else {
          emit({ event: "step_skip", step: "instagram" });
        }

        // ── Score + rank all videos ───────────────────────────────────────
        emit({ event: "step_start", step: "process" });
        const channelInfo: YouTubeChannel = {
          id: conn.channel_id,
          title: conn.channel_title,
          handle: conn.channel_handle ?? "",
          thumbnail: conn.channel_thumbnail ?? "",
          subscriberCount: channelStats.subscriberCount,
          totalViews: channelStats.totalViews,
          videoCount: videoIds.length,
        };

        const scored = scoreVideos(rawVideos, analyticsMap);
        emit({ event: "step_done", step: "process" });

        // ── Comments for top 10 + bottom 10 (1 unit each) ────────────────
        emit({ event: "step_start", step: "rank" });
        const commentTargetIds = [
          ...scored.scored.slice(0, 10),
          ...scored.scored.slice(-10).reverse(),
        ].map((v) => v.id);

        await maybeRefresh();
        const commentsMap = await fetchCommentsParallel(commentTargetIds, accessToken, (done, total) => {
          emit({ event: "comments_progress", done, total });
        }, quota);
        emit({ event: "step_done", step: "rank" });

        // ── Extended analytics: retention, subs, traffic, captions ────────
        // Analytics API (separate 200k/day quota) — only re-fetch stale rows.
        // Captions (Data API, expensive) — never re-fetch any previously-attempted video.
        emit({ event: "step_start", step: "extended_analytics" });
        const allVideoIds = scored.scored.map((v) => v.id);
        const CAPTION_N = parseInt(process.env.CAPTION_N ?? "10");
        const captionTargetIds = [
          ...scored.scored.slice(0, CAPTION_N),
          ...scored.scored.slice(-CAPTION_N).reverse(),
        ].map((v) => v.id);

        // Find rows that are fresh enough to skip Analytics API re-fetch.
        // On first run this is empty; on re-run it covers most/all rows.
        const staleAnalyticsThreshold = new Date(
          Date.now() - STALE_ANALYTICS_DAYS * 86_400_000
        ).toISOString();

        const { data: freshAnalyticsData } = await supabase
          .from("video_analytics")
          .select("video_id, relative_retention, subs_gained, subs_lost, traffic_sources")
          .eq("channel_id", conn.channel_id)
          .eq("user_id", userId)
          .gte("updated_at", staleAnalyticsThreshold);

        const freshAnalyticsIds = forceRefresh
          ? new Set<string>()
          : new Set((freshAnalyticsData ?? []).map((r) => r.video_id as string));

        console.log(`[analyze] Analytics freshness: ${freshAnalyticsIds.size}/${allVideoIds.length} rows fresh (≤${STALE_ANALYTICS_DAYS}d), skipping API re-fetch for those`);

        await maybeRefresh();

        // Fetch only stale/missing rows from Analytics API
        const [apiRetentionSubsMap, apiTrafficMap, demographics] = await Promise.all([
          fetchRetentionSubsBatch(allVideoIds, accessToken, freshAnalyticsIds),
          fetchTrafficBatch(allVideoIds, accessToken, freshAnalyticsIds),
          fetchDemographics(accessToken),
        ]);

        // Merge API results with cached DB rows to get complete maps
        const retentionSubsMap = new Map<string, VideoRetentionSubs>(apiRetentionSubsMap);
        const trafficMap = new Map<string, TrafficSources>(apiTrafficMap);
        for (const row of freshAnalyticsData ?? []) {
          if (!retentionSubsMap.has(row.video_id) && row.subs_gained !== null) {
            retentionSubsMap.set(row.video_id, {
              relativeRetention: row.relative_retention ?? null,
              subsGained: row.subs_gained ?? 0,
              subsLost: row.subs_lost ?? 0,
            });
          }
          if (!trafficMap.has(row.video_id) && row.traffic_sources) {
            trafficMap.set(row.video_id, row.traffic_sources as TrafficSources);
          }
        }

        // Load caption statuses for ALL videos in channel.
        // Skip any video where caption_status is set ('fetched', 'unavailable', 'failed').
        // Never re-attempt unavailable/failed captions — that's what burned the quota.
        const { data: existingCaptionRows } = await supabase
          .from("video_analytics")
          .select("video_id, caption_status")
          .eq("channel_id", conn.channel_id)
          .eq("user_id", userId)
          .not("caption_status", "is", null);

        const cachedCaptionStatus = new Map(
          (existingCaptionRows ?? []).map((r) => [r.video_id, r.caption_status as string]),
        );

        // Caption fetch — sequential, quota-guarded.
        // Returns a result only for videos we actually attempted (not cached).
        // Budget check happens BEFORE each call; if the budget would be exceeded, abort cleanly.
        const captionResults = new Map<string, { status: string; text: string | null; lang: string | null }>();
        const captionDebug = {
          eligible: captionTargetIds.length,
          alreadyCached: 0,
          fetched: 0,
          unavailable: 0,
          failed: 0,
          budgetBlocked: 0,
        };

        for (const videoId of captionTargetIds) {
          if (cachedCaptionStatus.has(videoId)) {
            captionDebug.alreadyCached++;
            continue;
          }
          // Hard abort before spending captions.list (50 units) on a budget-blown run
          if (quota.willExceed("captions.list")) {
            captionDebug.budgetBlocked++;
            console.warn(`[analyze] Quota guard: skipping caption fetch for ${videoId} (${quota.remaining} units remaining)`);
            continue;
          }
          await maybeRefresh();
          const result = await fetchCaption(videoId, accessToken, quota);
          captionResults.set(videoId, result);
          if (result.status === "fetched") captionDebug.fetched++;
          else if (result.status === "unavailable") captionDebug.unavailable++;
          else captionDebug.failed++;
        }

        // Upsert 1: retention + subs + traffic — ONLY for rows we just fetched from API.
        // Rows in freshAnalyticsIds already have up-to-date data in DB; skip them.
        const now = new Date().toISOString();
        const analyticsRows = allVideoIds
          .filter((id) => apiRetentionSubsMap.has(id) || apiTrafficMap.has(id))
          .map((videoId) => {
            const rs = apiRetentionSubsMap.get(videoId);
            const tf = apiTrafficMap.get(videoId);
            return {
              video_id: videoId,
              channel_id: conn.channel_id,
              user_id: userId,
              ...(rs && { relative_retention: rs.relativeRetention, subs_gained: rs.subsGained, subs_lost: rs.subsLost }),
              ...(tf && { traffic_sources: tf }),
              updated_at: now,
            };
          });

        for (let i = 0; i < analyticsRows.length; i += 500) {
          const { error: upsertErr } = await supabase
            .from("video_analytics")
            .upsert(analyticsRows.slice(i, i + 500), { onConflict: "video_id,channel_id" });
          if (upsertErr) console.error("[analyze] video_analytics upsert error:", upsertErr.message);
        }

        // Upsert 2: caption data for newly fetched targets only (caption columns only)
        for (const [videoId, result] of captionResults.entries()) {
          const { error: capErr } = await supabase
            .from("video_analytics")
            .upsert(
              {
                video_id: videoId,
                channel_id: conn.channel_id,
                user_id: userId,
                caption_status: result.status,
                caption_text: result.text,
                caption_lang: result.lang,
                updated_at: now,
              },
              { onConflict: "video_id,channel_id" },
            );
          if (capErr) console.error(`[analyze] caption upsert ${videoId}:`, capErr.message);
        }

        // Upsert demographics
        if (demographics?.length) {
          await supabase
            .from("channel_demographics")
            .upsert(
              { channel_id: conn.channel_id, user_id: userId, demographics, fetched_at: now },
              { onConflict: "channel_id,user_id" },
            );
        }

        // ── Quota summary log ─────────────────────────────────────────────
        console.log(quota.toLog());
        const analyticsDebugSummary = {
          totalVideos: allVideoIds.length,
          retentionSubsFetched: apiRetentionSubsMap.size,
          retentionSubsCached: retentionSubsMap.size - apiRetentionSubsMap.size,
          trafficFetched: apiTrafficMap.size,
          trafficCached: trafficMap.size - apiTrafficMap.size,
          demographicsFetched: !!demographics?.length,
          captions: captionDebug,
          quota: quota.toJSON(),
        };
        console.log("[analyze] Extended analytics:", JSON.stringify(analyticsDebugSummary));
        emit({ event: "step_done", step: "extended_analytics", analytics: analyticsDebugSummary });

        // ── Query caption texts for hook analysis ─────────────────────────
        const performerIds = [
          ...scored.scored.slice(0, 10).map((v) => v.id),
          ...scored.scored.slice(-10).map((v) => v.id),
        ];
        const { data: captionRows } = await supabase
          .from("video_analytics")
          .select("video_id, caption_status, caption_text")
          .eq("channel_id", conn.channel_id)
          .in("video_id", performerIds);
        const captionDataMap = new Map<string, { status: string; text: string | null }>(
          (captionRows ?? []).map((r) => [r.video_id, { status: r.caption_status ?? "unavailable", text: r.caption_text ?? null }])
        );

        // ── Build summary + call Claude ───────────────────────────────────
        const summary = buildSummary(scored, commentsMap, channelInfo);
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
            scored.scored,
            relRetentionMap,
          );
          summary.successPatterns.growthAnalysis = computeGrowthAnalysis(
            summary.topPerformers,
            summary.bottomPerformers,
            scored.scored,
            retentionSubsMap,
            trafficMap,
            summary.successPatterns.retentionAnalysis,
          );
        }
        console.log("[analyze] Summary built: topPerformers=%d bottomPerformers=%d outliers=%d topCommenters=%d totalVideos=%d",
          summary.topPerformers.length, summary.bottomPerformers.length, summary.outliers.length,
          summary.topCommenters?.length ?? 0, summary.totalVideosAnalysed);
        console.log("[analyze] Data sources: niche=%s instagram=%s tiktok=%s",
          nicheSummary ? `yes(${nicheSummary.niche})` : "no",
          igSummary ? `yes(@${igSummary.username} ${igSummary.topPosts.length}posts)` : "no",
          tikTokSummary ? `yes(@${tikTokSummary.displayName} ${tikTokSummary.videos.length}videos)` : "no");

        console.log("[analyze] Saving initial analysis to Supabase. user_id=%s channel_id=%s", userId, conn.channel_id);
        const { data: analysis, error: saveError } = await supabase
          .from("analyses")
          .insert({
            user_id: userId,
            channel_id: conn.channel_id,
            raw_videos: rawVideos,
            summary,
            total_videos: videoIds.length,
            instagram_summary: igSummary,
            tiktok_summary: tikTokSummary,
          })
          .select("id")
          .single();

        if (saveError || !analysis) {
          console.error("[analyze] Supabase analyses INSERT failed. error.code=%s error.message=%s error.details=%s",
            saveError?.code, saveError?.message, saveError?.details);
          emit({ event: "error", message: "Failed to save analysis" });
          return;
        }
        console.log("[analyze] Analysis INSERT OK. analysis_id=%s user_id=%s", analysis.id, userId);

        emit({ event: "step_start", step: "comments_intel" });
        let commentIntelligence;
        try {
          commentIntelligence = await analyzeComments(summary, tikTokSummary, igSummary);
          console.log("[analyze] Comment intelligence OK: themes=%d videoIdeas=%d personas=%d topCommenters=%d",
            commentIntelligence.themes.length, commentIntelligence.videoIdeas.length,
            commentIntelligence.audiencePersonas.length, commentIntelligence.topCommenters.length);
        } catch (err) {
          console.error("[analyze] Comment intelligence FAILED (non-fatal): %s", err instanceof Error ? err.message : String(err));
          commentIntelligence = {
            totalCommentsAnalysed: 0, themes: [], videoIdeas: [],
            emotionalSignals: { excited: 0, grateful: 0, curious: 0, confused: 0, critical: 0, requesting: 0 },
            sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 },
            audiencePersonas: [], topCommenters: [],
            keyInsight: "", generatedAt: new Date().toISOString(),
          };
        }
        // Audience analysis uses commentIntelligence + demographics — compute after analyzeComments
        if (summary.successPatterns) {
          summary.successPatterns.audienceAnalysis = computeAudienceAnalysis(demographics ?? null, commentIntelligence);
        }
        emit({ event: "step_done", step: "comments_intel" });

        emit({ event: "step_start", step: "save" });
        console.log("[analyze] Starting brief generation...");
        let brief, autopsy;
        try {
          ({ brief, autopsy } = await generateContentBrief(summary, nicheSummary, igSummary, tikTokSummary, commentIntelligence));
          console.log("[analyze] Brief generated. weeklyIdea='%s...' titleOptions=%d dataEvidence=%d",
            brief.weeklyIdea.slice(0, 60), brief.titleOptions.length, brief.dataEvidence.length);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Brief generation failed";
          console.error("[analyze] generateContentBrief FAILED: %s", msg);
          if (err instanceof Error && err.stack) console.error("[analyze] Stack:", err.stack.split("\n").slice(0, 5).join("\n"));
          emit({ event: "error", message: msg });
          return;
        }

        console.log("[analyze] Saving snapshot...");
        await saveSnapshot({ userId, channelId: conn.channel_id, analysisId: analysis.id, summary, rawVideos, commentIntelligence });

        console.log("[analyze] Updating analysis with brief/autopsy/comment_intelligence/summary...");
        const { error: updateError } = await supabase
          .from("analyses")
          .update({ summary, brief, autopsy, instagram_summary: igSummary, tiktok_summary: tikTokSummary, comment_intelligence: commentIntelligence })
          .eq("id", analysis.id);

        if (updateError) {
          console.error("[analyze] Supabase analyses UPDATE failed. code=%s message=%s", updateError.code, updateError.message);
        } else {
          console.log("[analyze] Analysis updated successfully.");
        }

        emit({ event: "step_done", step: "save" });
        emit({ event: "complete", analysisId: analysis.id, quotaSummary: quota.toJSON() });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Analysis failed";
        console.error("[analyze] Unhandled error:", msg);
        emit({ event: "error", message: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
