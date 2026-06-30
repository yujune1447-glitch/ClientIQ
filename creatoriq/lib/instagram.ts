import type { InstagramPost, InstagramSummary } from "@/types";

const FB = "https://graph.facebook.com/v18.0";

async function fbFetch(url: string) {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? `Facebook API error ${res.status}`);
  return data;
}

export async function refreshPageToken(userToken: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${FB}/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.INSTAGRAM_APP_ID}&client_secret=${process.env.INSTAGRAM_APP_SECRET}&fb_exchange_token=${userToken}`
    );
    const data = await res.json();
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

export async function getInstagramMedia(igUserId: string, pageToken: string): Promise<InstagramPost[]> {
  const posts: InstagramPost[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({
      fields: "id,caption,media_type,timestamp,like_count,comments_count,media_url,permalink,thumbnail_url",
      limit: "100",
      access_token: pageToken,
    });
    if (cursor) params.set("after", cursor);

    const data = await fbFetch(`${FB}/${igUserId}/media?${params}`);
    if (!data.data?.length) break;

    posts.push(
      ...data.data.map((item: {
        id: string;
        caption?: string;
        media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
        timestamp: string;
        like_count?: number;
        comments_count?: number;
        media_url?: string;
        permalink?: string;
        thumbnail_url?: string;
      }) => ({
        id: item.id,
        caption: item.caption ?? "",
        media_type: item.media_type,
        timestamp: item.timestamp,
        like_count: item.like_count ?? 0,
        comments_count: item.comments_count ?? 0,
        media_url: item.media_url ?? item.thumbnail_url ?? "",
        permalink: item.permalink ?? "",
      }))
    );

    cursor = data.paging?.cursors?.after;
    if (!data.paging?.next) break;
  } while (true);

  return posts;
}

async function getPostComments(mediaId: string, pageToken: string): Promise<string[]> {
  try {
    const params = new URLSearchParams({
      fields: "text,timestamp",
      limit: "5",
      access_token: pageToken,
    });
    const data = await fbFetch(`${FB}/${mediaId}/comments?${params}`);
    return (data.data ?? []).map((c: { text: string }) => c.text).filter(Boolean);
  } catch {
    return [];
  }
}

async function getPostInsights(
  mediaId: string,
  mediaType: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM",
  pageToken: string
): Promise<{ impressions: number; reach: number; engagement: number; saved: number; video_views?: number }> {
  try {
    const metrics = ["impressions", "reach", "engagement", "saved"];
    if (mediaType === "VIDEO") metrics.push("video_views");

    const data = await fbFetch(
      `${FB}/${mediaId}/insights?metric=${metrics.join(",")}&access_token=${pageToken}`
    );

    const result: Record<string, number> = { impressions: 0, reach: 0, engagement: 0, saved: 0 };
    for (const item of data.data ?? []) {
      result[item.name] = item.values?.[0]?.value ?? 0;
    }
    return result as { impressions: number; reach: number; engagement: number; saved: number; video_views?: number };
  } catch {
    return { impressions: 0, reach: 0, engagement: 0, saved: 0 };
  }
}

function buildContentTypeBreakdown(
  posts: (InstagramPost & { engagement?: number })[]
): InstagramSummary["contentTypeBreakdown"] {
  const buckets: Record<string, { count: number; totalEngagement: number }> = {};
  for (const p of posts) {
    if (!buckets[p.media_type]) buckets[p.media_type] = { count: 0, totalEngagement: 0 };
    buckets[p.media_type].count++;
    buckets[p.media_type].totalEngagement += (p.engagement ?? p.like_count + p.comments_count);
  }
  return Object.entries(buckets).map(([type, { count, totalEngagement }]) => ({
    type,
    count,
    avgEngagement: Math.round(totalEngagement / count),
  })).sort((a, b) => b.avgEngagement - a.avgEngagement);
}

export async function fetchInstagramData(
  igUserId: string,
  pageToken: string,
  followerCount: number,
  username: string,
  mediaCount: number,
  profilePictureUrl: string,
  onProgress?: (done: number, total: number) => void
): Promise<InstagramSummary> {
  const allPosts = await getInstagramMedia(igUserId, pageToken);
  const postsToAnalyse = allPosts.slice(0, 50);

  const BATCH = 10;
  const enriched: (InstagramPost & { impressions: number; reach: number; engagement: number; saved: number; video_views?: number })[] = [];

  for (let i = 0; i < postsToAnalyse.length; i += BATCH) {
    const batch = postsToAnalyse.slice(i, i + BATCH);
    const insights = await Promise.all(batch.map((p) => getPostInsights(p.id, p.media_type, pageToken)));
    batch.forEach((post, j) => enriched.push({ ...post, ...insights[j] }));
    onProgress?.(Math.min(i + BATCH, postsToAnalyse.length), postsToAnalyse.length);
  }

  const n = enriched.length || 1;
  const avgLikes = enriched.reduce((s, p) => s + p.like_count, 0) / n;
  const avgComments = enriched.reduce((s, p) => s + p.comments_count, 0) / n;
  const avgReach = enriched.reduce((s, p) => s + p.reach, 0) / n;
  const avgEngagement = enriched.reduce((s, p) => s + p.engagement, 0) / n;
  const engagementRate = followerCount > 0 ? ((avgLikes + avgComments) / followerCount) * 100 : 0;

  const sortedByEngagement = [...enriched].sort((a, b) => b.engagement - a.engagement || b.like_count - a.like_count);
  const top5 = sortedByEngagement.slice(0, 5);
  const commentsResults = await Promise.all(top5.map((p) => getPostComments(p.id, pageToken)));
  const top5WithComments = top5.map((p, i) => ({ ...p, topComments: commentsResults[i] }));
  const topPosts = [
    ...top5WithComments,
    ...sortedByEngagement.slice(5, 10),
  ];

  return {
    username,
    followerCount,
    mediaCount,
    profilePictureUrl,
    posts: enriched,
    averages: {
      likes: Math.round(avgLikes),
      comments: Math.round(avgComments),
      reach: Math.round(avgReach),
      engagement: Math.round(avgEngagement),
      engagementRate: Math.round(engagementRate * 100) / 100,
    },
    topPosts,
    contentTypeBreakdown: buildContentTypeBreakdown(enriched),
  };
}
