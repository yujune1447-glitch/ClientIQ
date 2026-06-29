import type { TikTokVideo, TikTokSummary } from "@/types";

const TIKTOK_API = "https://open.tiktokapis.com/v2";

const VIDEO_FIELDS =
  "id,title,video_description,duration,cover_image_url,share_url,like_count,comment_count,share_count,view_count,create_time";

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
