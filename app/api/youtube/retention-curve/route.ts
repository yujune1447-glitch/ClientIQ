import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { refreshAccessToken } from "@/lib/youtube";
import { fetchRetentionCurve } from "@/lib/youtube-analytics";

export async function GET(request: NextRequest) {
  const videoId = request.nextUrl.searchParams.get("videoId");
  if (!videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });

  const userId = request.cookies.get("user_id")?.value;
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const supabase = createAdminClient();

  // Cache hit: return immediately
  const { data: cached } = await supabase
    .from("video_analytics")
    .select("retention_curve, curve_fetched_at")
    .eq("video_id", videoId)
    .eq("user_id", userId)
    .single();

  if (cached?.retention_curve) {
    return NextResponse.json({
      curve: cached.retention_curve,
      cached: true,
      fetchedAt: cached.curve_fetched_at,
    });
  }

  // Cache miss: fetch from Analytics API
  const { data: conn } = await supabase
    .from("youtube_connections")
    .select("access_token, refresh_token, token_expires_at, channel_id")
    .eq("user_id", userId)
    .single();

  if (!conn) return NextResponse.json({ error: "No YouTube connection" }, { status: 404 });

  let accessToken = conn.access_token;
  if (new Date(conn.token_expires_at ?? 0) <= new Date()) {
    try {
      const refreshed = await refreshAccessToken(conn.refresh_token);
      accessToken = refreshed.accessToken;
    } catch {
      return NextResponse.json({ error: "Token refresh failed" }, { status: 401 });
    }
  }

  const curve = await fetchRetentionCurve(videoId, accessToken);
  if (!curve || !curve.length) {
    return NextResponse.json({ error: "Retention curve unavailable for this video" }, { status: 404 });
  }

  const now = new Date().toISOString();

  // Upsert into cache — only touches retention_curve columns
  await supabase.from("video_analytics").upsert(
    {
      video_id: videoId,
      channel_id: conn.channel_id,
      user_id: userId,
      retention_curve: curve,
      curve_fetched_at: now,
      updated_at: now,
    },
    { onConflict: "video_id,channel_id" },
  );

  return NextResponse.json({ curve, cached: false });
}
