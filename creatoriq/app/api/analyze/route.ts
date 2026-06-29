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
import { searchNicheVideoIds, getNicheVideoDetails, processNicheData } from "@/lib/niche";
import { saveSnapshot } from "@/lib/snapshot";
import { fetchInstagramData } from "@/lib/instagram";
import type { YouTubeChannel, NicheSummary, InstagramSummary } from "@/types";

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
        if (!userId) { emit({ event: "error", message: "Not authenticated" }); return; }

        const supabase = createAdminClient();

        const [{ data: conn }, { data: userData }, { data: igConn }] = await Promise.all([
          supabase.from("youtube_connections").select("*").eq("user_id", userId).single(),
          supabase.from("users").select("niche").eq("id", userId).single(),
          supabase.from("instagram_connections").select("*").eq("user_id", userId).maybeSingle(),
        ]);

        if (!conn) { emit({ event: "error", message: "No YouTube connection found" }); return; }
        const niche: string | null = userData?.niche ?? null;

        let accessToken: string = conn.access_token;
        let tokenExpiresAt: Date = new Date(conn.token_expires_at);

        const maybeRefresh = async () => {
          if (tokenExpiresAt <= new Date()) {
            try {
              const refreshed = await refreshAccessToken(conn.refresh_token);
              accessToken = refreshed.accessToken;
              tokenExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000);
              await supabase.from("youtube_connections").update({
                access_token: accessToken,
                token_expires_at: tokenExpiresAt.toISOString(),
              }).eq("id", conn.id);
            } catch {
              emit({ event: "error", message: "needs_reauth" });
              throw new Error("needs_reauth");
            }
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

        // ── Instagram data (if connected) ────────────────────────────────
        let igSummary: InstagramSummary | null = null;
        if (igConn) {
          emit({ event: "step_start", step: "instagram" });
          try {
            igSummary = await fetchInstagramData(
              igConn.ig_user_id,
              igConn.page_access_token,
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
        emit({ event: "step_start", step: "save" });
        const summary = buildSummary(scored, commentsMap, channelInfo);

        const { data: analysis, error: saveError } = await supabase
          .from("analyses")
          .insert({
            user_id: userId,
            channel_id: conn.channel_id,
            raw_videos: rawVideos,
            summary,
            total_videos: videoIds.length,
            instagram_summary: igSummary,
          })
          .select("id")
          .single();

        if (saveError || !analysis) {
          emit({ event: "error", message: "Failed to save analysis" });
          return;
        }

        const [{ brief, autopsy }] = await Promise.all([
          generateContentBrief(summary, nicheSummary, igSummary),
          saveSnapshot({ userId, channelId: conn.channel_id, analysisId: analysis.id, summary, rawVideos }),
        ]);
        await supabase
          .from("analyses")
          .update({ brief, autopsy, instagram_summary: igSummary })
          .eq("id", analysis.id);

        emit({ event: "step_done", step: "save" });
        emit({ event: "complete", analysisId: analysis.id });
      } catch (err) {
        emit({ event: "error", message: err instanceof Error ? err.message : "Analysis failed" });
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
