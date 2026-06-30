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
import { scoreVideos, buildSummary } from "@/lib/process";
import { generateContentBrief } from "@/lib/claude";
import { analyzeComments } from "@/lib/comment-intelligence";
import { searchNicheVideoIds, getNicheVideoDetails, processNicheData } from "@/lib/niche";
import { saveSnapshot } from "@/lib/snapshot";
import { fetchInstagramData, refreshPageToken } from "@/lib/instagram";
import { fetchTikTokData, refreshTikTokToken } from "@/lib/tiktok";
import type { YouTubeChannel, NicheSummary, InstagramSummary, TikTokSummary } from "@/types";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (payload: Record<string, unknown>) => {
        if (request.signal.aborted) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      try {
        const userId = request.cookies.get("user_id")?.value;
        console.log("[analyze] Request received. user_id_from_cookie=%s", userId ?? "MISSING");
        if (!userId) { emit({ event: "error", message: "Not authenticated" }); return; }

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
        emit({ event: "step_done", step: "connect" });

        // ── Pull all video IDs (full pagination) ──────────────────────────
        emit({ event: "step_start", step: "pull" });
        const channelStats = await getChannelInfo(accessToken);
        const videoIds = await getAllVideoIds(channelStats.uploadsPlaylistId, accessToken, (count) => {
          emit({ event: "videos_found", count });
        });

        await maybeRefresh();
        const rawVideos = await getVideoDetails(videoIds, accessToken, (current, total) => {
          emit({ event: "details_progress", current, total });
        });
        emit({ event: "step_done", step: "pull" });

        // ── Analytics (paginated, 500 rows per page) ──────────────────────
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

        // ── Score + rank all videos (single pass) ─────────────────────────
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

        // ── Fetch comments for top 10 + bottom 10 only (parallel, batched) ─
        emit({ event: "step_start", step: "rank" });
        const commentTargetIds = [
          ...scored.scored.slice(0, 10),
          ...scored.scored.slice(-10).reverse(),
        ].map((v) => v.id);

        await maybeRefresh();
        const commentsMap = await fetchCommentsParallel(commentTargetIds, accessToken, (done, total) => {
          emit({ event: "comments_progress", done, total });
        });
        emit({ event: "step_done", step: "rank" });

        // ── Build summary + store raw + call Claude ───────────────────────
        const summary = buildSummary(scored, commentsMap, channelInfo);
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

        console.log("[analyze] Updating analysis with brief/autopsy/comment_intelligence...");
        const { error: updateError } = await supabase
          .from("analyses")
          .update({ brief, autopsy, instagram_summary: igSummary, tiktok_summary: tikTokSummary, comment_intelligence: commentIntelligence })
          .eq("id", analysis.id);

        if (updateError) {
          console.error("[analyze] Supabase analyses UPDATE failed. code=%s message=%s", updateError.code, updateError.message);
        } else {
          console.log("[analyze] Analysis updated successfully.");
        }

        emit({ event: "step_done", step: "save" });
        emit({ event: "complete", analysisId: analysis.id });
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
