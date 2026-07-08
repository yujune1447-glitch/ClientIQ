import type { TikTokVideo, TikTokSummary } from "@/types";
import type { createAdminClient } from "@/lib/supabase-admin";

const TIKTOK_API = "https://open.tiktokapis.com/v2";

// Video-level endpoints (video.list / video.comment.list) require the `video.list`
// scope, which is NOT in the approved set (user.info.basic/profile/stats). Keep all
// video fetching behind this flag until production access grants that scope.
export const TIKTOK_VIDEO_ENABLED = process.env.TIKTOK_VIDEO_ENABLED === "true";

const VIDEO_FIELDS =
  "id,title,video_description,duration,cover_image_url,share_url,like_count,comment_count,share_count,view_count,create_time";

const USER_INFO_FIELDS =
  "open_id,union_id,avatar_url,display_name,bio_description,profile_deep_link,is_verified,follower_count,following_count,likes_count,video_count";

export interface TikTokUserInfo {
  open_id: string;
  union_id: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio_description: string | null;
  profile_deep_link: string | null;
  is_verified: boolean;
  follower_count: number;
  following_count: number;
  likes_count: number;
  video_count: number;
}

// user.info.basic (avatar/display_name), user.info.profile (bio/profile link/verified),
// user.info.stats (follower/following/likes/video counts) — one call, all approved scopes.
export async function fetchTikTokUserInfo(accessToken: string): Promise<TikTokUserInfo | null> {
  try {
    const res = await fetch(`${TIKTOK_API}/user/info/?fields=${USER_INFO_FIELDS}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    const user = data?.data?.user;
    if (!res.ok || data.error?.code !== "ok" || !user) return null;
    return {
      open_id: user.open_id,
      union_id: user.union_id ?? null,
      display_name: user.display_name ?? null,
      avatar_url: user.avatar_url ?? null,
      bio_description: user.bio_description ?? null,
      profile_deep_link: user.profile_deep_link ?? null,
      is_verified: user.is_verified ?? false,
      follower_count: user.follower_count ?? 0,
      following_count: user.following_count ?? 0,
      likes_count: user.likes_count ?? 0,
      video_count: user.video_count ?? 0,
    };
  } catch {
    return null;
  }
}

type AdminClient = ReturnType<typeof createAdminClient>;

export type TikTokTokenResult =
  | { status: "ok"; accessToken: string; connection: TikTokConnectionRow }
  | { status: "needs_reconnect" }
  | { status: "disconnected" };

export interface TikTokConnectionRow {
  id: string;
  open_id: string;
  display_name: string | null;
  avatar_url: string | null;
  follower_count: number;
  following_count: number;
  likes_count: number;
  video_count: number;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  refresh_token_expires_at: string | null;
}

const CONNECTION_COLUMNS =
  "id, open_id, display_name, avatar_url, follower_count, following_count, likes_count, video_count, access_token, refresh_token, token_expires_at, refresh_token_expires_at";

// Returns a valid access token, refreshing when within 1h of expiry. On refresh
// failure the connection is cleared (no silent failure) so the UI prompts reconnect.
export async function getValidTikTokAccessToken(
  userId: string,
  supabase: AdminClient
): Promise<TikTokTokenResult> {
  const { data: conn } = await supabase
    .from("tiktok_connections")
    .select(CONNECTION_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (!conn) return { status: "disconnected" };

  const connection = conn as TikTokConnectionRow;
  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0;
  const oneHourFromNow = Date.now() + 60 * 60 * 1000;

  if (expiresAt > oneHourFromNow) {
    return { status: "ok", accessToken: connection.access_token, connection };
  }

  if (!connection.refresh_token) {
    await supabase.from("tiktok_connections").delete().eq("user_id", userId);
    return { status: "needs_reconnect" };
  }

  const refreshed = await refreshTikTokToken(connection.refresh_token);
  if (!refreshed) {
    await supabase.from("tiktok_connections").delete().eq("user_id", userId);
    return { status: "needs_reconnect" };
  }

  const { error: updateError } = await supabase
    .from("tiktok_connections")
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token ?? connection.refresh_token,
      token_expires_at: new Date(Date.now() + (refreshed.expires_in ?? 86400) * 1000).toISOString(),
      refresh_token_expires_at: refreshed.refresh_expires_in
        ? new Date(Date.now() + refreshed.refresh_expires_in * 1000).toISOString()
        : connection.refresh_token_expires_at,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (updateError) {
    await supabase.from("tiktok_connections").delete().eq("user_id", userId);
    return { status: "needs_reconnect" };
  }

  return {
    status: "ok",
    accessToken: refreshed.access_token,
    connection: { ...connection, access_token: refreshed.access_token },
  };
}

export async function refreshTikTokToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
} | null> {
  try {
    const res = await fetch(`${TIKTOK_API}/oauth/token/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY!,
        client_secret: process.env.TIKTOK_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    const data = await res.json();
    if (!data.access_token) return null;
    return data;
  } catch {
    return null;
  }
}

async function fetchVideoPage(
  accessToken: string,
  cursor: number
): Promise<{ videos: TikTokVideo[]; nextCursor: number; hasMore: boolean }> {
  const res = await fetch(`${TIKTOK_API}/video/list/?fields=${VIDEO_FIELDS}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ cursor, max_count: 20 }),
  });
  const data = await res.json();

  if (!res.ok || data.error?.code !== "ok") {
    throw new Error(data.error?.message ?? `TikTok API error ${res.status}`);
  }

  const raw = data.data?.videos ?? [];
  const videos: TikTokVideo[] = raw.map((v: {
    id: string;
    title?: string;
    video_description?: string;
    duration?: number;
    cover_image_url?: string;
    share_url?: string;
    like_count?: number;
    comment_count?: number;
    share_count?: number;
    view_count?: number;
    create_time?: number;
  }) => ({
    id: v.id,
    title: v.title ?? "",
    video_description: v.video_description ?? "",
    duration: v.duration ?? 0,
    cover_image_url: v.cover_image_url ?? "",
    share_url: v.share_url ?? "",
    like_count: v.like_count ?? 0,
    comment_count: v.comment_count ?? 0,
    share_count: v.share_count ?? 0,
    view_count: v.view_count ?? 0,
    create_time: v.create_time ?? 0,
  }));

  return {
    videos,
    nextCursor: data.data?.cursor ?? 0,
    hasMore: data.data?.has_more ?? false,
  };
}

async function fetchAllVideos(accessToken: string, maxVideos = 200): Promise<TikTokVideo[]> {
  if (!TIKTOK_VIDEO_ENABLED) return [];
  const all: TikTokVideo[] = [];
  let cursor = 0;
  let hasMore = true;

  while (hasMore && all.length < maxVideos) {
    const page = await fetchVideoPage(accessToken, cursor);
    all.push(...page.videos);
    cursor = page.nextCursor;
    hasMore = page.hasMore;
    if (!page.videos.length) break;
  }

  return all;
}

async function fetchVideoComments(videoId: string, accessToken: string): Promise<string[]> {
  try {
    const res = await fetch(
      `${TIKTOK_API}/video/comment/list/?fields=id,text,like_count,create_time&video_id=${videoId}&max_count=20`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await res.json();
    if (!res.ok || data.error?.code !== "ok") return [];
    return (data.data?.comments ?? []).map((c: { text: string }) => c.text).filter(Boolean);
  } catch {
    return [];
  }
}

export async function fetchTikTokData(
  accessToken: string,
  displayName: string,
  followerCount: number,
  followingCount: number,
  likesCount: number,
  videoCount: number,
  avatarUrl: string,
  onProgress?: (done: number, total: number) => void
): Promise<TikTokSummary> {
  const allVideos = await fetchAllVideos(accessToken);
  const toAnalyse = allVideos.slice(0, 50);

  const byViews = [...toAnalyse].sort((a, b) => b.view_count - a.view_count);
  const top10Ids = byViews.slice(0, 10).map((v) => v.id);

  const commentsMap = new Map<string, string[]>();
  for (let i = 0; i < top10Ids.length; i++) {
    const comments = await fetchVideoComments(top10Ids[i], accessToken);
    commentsMap.set(top10Ids[i], comments);
    onProgress?.(i + 1, top10Ids.length);
  }

  const enriched = toAnalyse.map((v) => ({
    ...v,
    top_comments: commentsMap.get(v.id) ?? [],
  }));

  const n = enriched.length || 1;
  const avgViews = enriched.reduce((s, v) => s + v.view_count, 0) / n;
  const avgLikes = enriched.reduce((s, v) => s + v.like_count, 0) / n;
  const avgComments = enriched.reduce((s, v) => s + v.comment_count, 0) / n;
  const avgShares = enriched.reduce((s, v) => s + v.share_count, 0) / n;
  const engagementRate =
    followerCount > 0
      ? ((avgLikes + avgComments + avgShares) / followerCount) * 100
      : 0;

  const topVideos = [...enriched].sort((a, b) => b.view_count - a.view_count).slice(0, 10);

  return {
    displayName,
    followerCount,
    followingCount,
    likesCount,
    videoCount,
    avatarUrl,
    videos: enriched,
    averages: {
      views: Math.round(avgViews),
      likes: Math.round(avgLikes),
      comments: Math.round(avgComments),
      shares: Math.round(avgShares),
      engagementRate: Math.round(engagementRate * 100) / 100,
    },
    topVideos,
  };
}
