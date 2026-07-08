import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getValidTikTokAccessToken, fetchTikTokUserInfo } from "@/lib/tiktok";

export async function GET(request: NextRequest) {
  const userId = request.cookies.get("user_id")?.value;
  if (!userId) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const supabase = createAdminClient();
  const result = await getValidTikTokAccessToken(userId, supabase);

  if (result.status === "disconnected") {
    return NextResponse.json({ connected: false });
  }

  if (result.status === "needs_reconnect") {
    return NextResponse.json({ connected: false, needsReconnect: true }, { status: 401 });
  }

  const { accessToken, connection } = result;

  // Pull live stats when possible; fall back to stored values if the call fails.
  const info = await fetchTikTokUserInfo(accessToken);
  if (info) {
    await supabase
      .from("tiktok_connections")
      .update({
        display_name: info.display_name,
        avatar_url: info.avatar_url,
        follower_count: info.follower_count,
        following_count: info.following_count,
        likes_count: info.likes_count,
        video_count: info.video_count,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
  }

  return NextResponse.json({
    connected: true,
    account: {
      displayName: info?.display_name ?? connection.display_name,
      avatarUrl: info?.avatar_url ?? connection.avatar_url,
      followerCount: info?.follower_count ?? connection.follower_count,
      followingCount: info?.following_count ?? connection.following_count,
      likesCount: info?.likes_count ?? connection.likes_count,
      videoCount: info?.video_count ?? connection.video_count,
    },
  });
}
