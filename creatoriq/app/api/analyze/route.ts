import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import {
  refreshAccessToken,
  getUploadsPlaylistId,
  getAllVideoIds,
  getVideoDetails,
  getChannelAnalytics,
  getTopComments,
} from "@/lib/youtube";
import { processChannelData } from "@/lib/process";
import { generateContentBrief } from "@/lib/claude";
import type { YouTubeChannel } from "@/types";

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
        if (!userId) {
          emit({ event: "error", message: "Not authenticated" });
          return;
        }

        const supabase = createAdminClient();

        const { data: conn } = await supabase
          .from("youtube_connections")
          .select("*")
          .eq("user_id", userId)
          .single();

        if (!conn) {
          emit({ event: "error", message: "No YouTube connection found" });
          return;
        }

        let accessToken: string = conn.access_token;
        if (new Date(conn.token_expires_at) <= new Date()) {
          const refreshed = await refreshAccessToken(conn.refresh_token);
          accessToken = refreshed.accessToken;
          await supabase
            .from("youtube_connections")
            .update({
              access_token: accessToken,
              token_expires_at: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
            })
            .eq("id", conn.id);
        }

        emit({ event: "step_done", step: "connect" });

        // Pull all video IDs
        emit({ event: "step_start", step: "pull" });
        const uploadsPlaylistId = await getUploadsPlaylistId(accessToken);
        const videoIds = await getAllVideoIds(uploadsPlaylistId, accessToken, (count) => {
          emit({ event: "videos_found", count });
        });

        const rawVideos = await getVideoDetails(videoIds, accessToken, (current, total) => {
          emit({ event: "details_progress", current, total });
        });
        emit({ event: "step_done", step: "pull" });

        // Pull analytics
        emit({ event: "step_start", step: "analytics" });
        const analyticsMap = await getChannelAnalytics(accessToken);
        emit({ event: "step_done", step: "analytics" });

        // Process: score + rank
        emit({ event: "step_start", step: "process" });
        const channelInfo: YouTubeChannel = {
          id: conn.channel_id,
          title: conn.channel_title,
          handle: conn.channel_handle ?? "",
          thumbnail: conn.channel_thumbnail ?? "",
          subscriberCount: conn.subscriber_count,
          totalViews: 0,
          videoCount: videoIds.length,
        };

        const preliminary = processChannelData(rawVideos, analyticsMap, new Map(), channelInfo);
        emit({ event: "step_done", step: "process" });

        // Fetch comments for top + bottom performers
        emit({ event: "step_start", step: "rank" });
        const commentTargets = [
          ...preliminary.topPerformers,
          ...preliminary.bottomPerformers,
        ].map((v) => v.id);

        const commentsMap = new Map<string, string[]>();
        for (const videoId of commentTargets) {
          if (request.signal.aborted) return;
          const comments = await getTopComments(videoId, accessToken);
          commentsMap.set(videoId, comments);
        }
        emit({ event: "step_done", step: "rank" });

        // Build final summary with comments
        emit({ event: "step_start", step: "save" });
        const summary = processChannelData(rawVideos, analyticsMap, commentsMap, channelInfo);

        const { data: analysis, error: saveError } = await supabase
          .from("analyses")
          .insert({
            user_id: userId,
            channel_id: conn.channel_id,
            summary,
            total_videos: videoIds.length,
          })
          .select("id")
          .single();

        if (saveError || !analysis) {
          emit({ event: "error", message: "Failed to save analysis" });
          return;
        }

        const { brief, autopsy } = await generateContentBrief(summary);

        await supabase
          .from("analyses")
          .update({ brief, autopsy })
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
