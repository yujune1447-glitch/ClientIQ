import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";
import WorkspaceShell from "@/app/components/WorkspaceShell";
import type { ChannelSummary, ContentBrief, ContentAutopsy, InstagramSummary, TikTokSummary, CommentIntelligence, ChannelSnapshot } from "@/types";
import type { AnalysisData } from "@/app/components/AnalysisContent";

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ analysis?: string; instagram_error?: string; tiktok_error?: string }>;
}) {
  const { analysis: analysisId, instagram_error, tiktok_error } = await searchParams;
  const cookieStore = await cookies();
  const userId = cookieStore.get("user_id")?.value;

  if (!userId) redirect("/");

  const supabase = createAdminClient();

  const [
    { data: allAnalyses, error: analysesErr },
    { data: ytConn, error: ytErr },
    { data: igConn },
    { data: ttConn },
    { data: snapshots },
  ] = await Promise.all([
    supabase
      .from("analyses")
      .select("id, created_at, summary, is_unread, generated_by")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase.from("youtube_connections").select("channel_title, channel_thumbnail, channel_handle, channel_id").eq("user_id", userId).maybeSingle(),
    supabase.from("instagram_connections").select("username, profile_picture_url").eq("user_id", userId).maybeSingle(),
    supabase.from("tiktok_connections").select("display_name, avatar_url, follower_count, following_count, likes_count, video_count").eq("user_id", userId).maybeSingle(),
    supabase.from("channel_snapshots").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
  ]);

  const targetId = analysisId ?? allAnalyses?.[0]?.id ?? null;

  let selectedAnalysis = null;
  if (targetId) {
    const { data, error: selErr } = await supabase
      .from("analyses")
      .select("id,summary,brief,autopsy,instagram_summary,tiktok_summary,comment_intelligence,is_unread,generated_by,created_at,weekly_subs_gained,weekly_subs_lost")
      .eq("id", targetId)
      .eq("user_id", userId)
      .single();
    selectedAnalysis = data;
  }

  const sidebarAnalyses = (allAnalyses ?? []).map((a) => ({
    id: a.id,
    createdAt: a.created_at,
    channelTitle: (a.summary as ChannelSummary)?.channel?.title ?? "Analysis",
    isUnread: a.is_unread ?? false,
    isScheduled: a.generated_by === "scheduled",
  }));

  return (
    <WorkspaceShell
      sidebarAnalyses={sidebarAnalyses}
      selectedAnalysisId={targetId}
      selectedAnalysis={
        selectedAnalysis
          ? ({
              id: selectedAnalysis.id,
              createdAt: selectedAnalysis.created_at,
              summary: selectedAnalysis.summary as ChannelSummary,
              brief: (selectedAnalysis.brief ?? null) as ContentBrief | null,
              autopsy: (selectedAnalysis.autopsy ?? null) as ContentAutopsy | null,
              igSummary: (selectedAnalysis.instagram_summary ?? null) as InstagramSummary | null,
              tikTokSummary: (selectedAnalysis.tiktok_summary ?? null) as TikTokSummary | null,
              commentIntel: (selectedAnalysis.comment_intelligence ?? null) as CommentIntelligence | null,
              isUnread: selectedAnalysis.is_unread === true,
              isScheduled: selectedAnalysis.generated_by === "scheduled",
              weeklySubsGained: selectedAnalysis.weekly_subs_gained ?? null,
              weeklySubsLost: selectedAnalysis.weekly_subs_lost ?? null,
            } satisfies AnalysisData)
          : null
      }
      ytConn={
        ytConn
          ? {
              channelTitle: ytConn.channel_title,
              channelThumbnail: ytConn.channel_thumbnail,
              channelHandle: ytConn.channel_handle,
              channelId: ytConn.channel_id,
            }
          : null
      }
      igConn={igConn ? { username: igConn.username, profilePictureUrl: igConn.profile_picture_url } : null}
      ttConn={
        ttConn
          ? {
              displayName: ttConn.display_name,
              avatarUrl: ttConn.avatar_url,
              followerCount: ttConn.follower_count ?? 0,
              followingCount: ttConn.following_count ?? 0,
              likesCount: ttConn.likes_count ?? 0,
              videoCount: ttConn.video_count ?? 0,
            }
          : null
      }
      snapshots={(snapshots ?? []) as ChannelSnapshot[]}
      instagramError={instagram_error}
      tiktokError={tiktok_error}
    />
  );
}
