import type { RawVideo, VideoAnalytics } from "@/types";
import type { QuotaBudget } from "@/lib/quota";

const YT = "https://www.googleapis.com/youtube/v3";
const YT_ANALYTICS = "https://youtubeanalytics.googleapis.com/v2/reports";

async function ytFetch(url: string, accessToken: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? `YouTube API error ${res.status}`);
  return data;
}

export async function refreshAccessToken(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID!,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Token refresh failed");
  return { accessToken: data.access_token as string, expiresIn: data.expires_in as number };
}

export async function getChannelInfo(accessToken: string): Promise<{
  uploadsPlaylistId: string;
  subscriberCount: number;
  totalViews: number;
}> {
  const data = await ytFetch(`${YT}/channels?part=contentDetails,statistics&mine=true`, accessToken);
  const item = data.items?.[0];
  if (!item) throw new Error("Could not find channel");
  return {
    uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads ?? "",
    subscriberCount: parseInt(item.statistics?.subscriberCount ?? "0"),
    totalViews: parseInt(item.statistics?.viewCount ?? "0"),
  };
}

// Uses playlistItems.list: 1 unit/call (50 videos/call). Never uses search.list.
export async function getAllVideoIds(
  playlistId: string,
  accessToken: string,
  onProgress: (count: number) => void,
  quota?: QuotaBudget,
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;

  do {
    if (quota?.willExceed("playlistItems.list")) {
      console.warn("[youtube] Quota budget would be exceeded during playlist enumeration — stopping early");
      break;
    }
    const params = new URLSearchParams({ playlistId, part: "contentDetails", maxResults: "50" });
    if (pageToken) params.set("pageToken", pageToken);
    const data = await ytFetch(`${YT}/playlistItems?${params}`, accessToken);
    quota?.charge("playlistItems.list");
    for (const item of data.items ?? []) {
      const id = item.contentDetails?.videoId;
      if (id) ids.push(id);
    }
    pageToken = data.nextPageToken;
    onProgress(ids.length);
  } while (pageToken);

  return ids;
}

// 1 unit per 50-video batch.
export async function getVideoDetails(
  ids: string[],
  accessToken: string,
  onProgress: (current: number, total: number) => void,
  quota?: QuotaBudget,
): Promise<RawVideo[]> {
  const videos: RawVideo[] = [];

  for (let i = 0; i < ids.length; i += 50) {
    if (quota?.willExceed("videos.list")) {
      console.warn(`[youtube] Quota budget would be exceeded at video batch ${i / 50 + 1} — stopping early`);
      break;
    }
    const batch = ids.slice(i, i + 50);
    const params = new URLSearchParams({ id: batch.join(","), part: "snippet,statistics,contentDetails" });
    const data = await ytFetch(`${YT}/videos?${params}`, accessToken);
    quota?.charge("videos.list");
    videos.push(...(data.items ?? []));
    onProgress(videos.length, ids.length);
  }

  return videos;
}

export async function getChannelAnalytics(
  accessToken: string,
  onProgress?: (page: number, total: number) => void,
): Promise<Map<string, VideoAnalytics>> {
  const map = new Map<string, VideoAnalytics>();
  let startIndex = 1;
  let page = 0;

  while (true) {
    // The YouTube Analytics "top videos" report (dimensions=video) caps maxResults
    // at 200 — requesting more returns HTTP 400 "query is not supported", which
    // would silently zero out ALL per-video analytics (watch time + retention).
    const params = new URLSearchParams({
      ids: "channel==mine",
      startDate: "2005-01-01",
      endDate: new Date().toISOString().slice(0, 10),
      metrics: "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage",
      dimensions: "video",
      sort: "-views",
      maxResults: "200",
      startIndex: String(startIndex),
    });

    const res = await fetch(`${YT_ANALYTICS}?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    if (page === 0) console.log("[getChannelAnalytics] raw response (page 1):", JSON.stringify(data));
    if (!res.ok || !data.rows?.length) break;

    page++;
    for (const [videoId, , estMinutes, avgDuration, avgPct] of data.rows) {
      map.set(videoId, {
        averageViewDuration: avgDuration,
        averageViewPercentage: avgPct,
        estimatedMinutesWatched: estMinutes,
        impressions: 0,
        ctr: 0,
      });
    }

    onProgress?.(page, map.size);

    if (data.rows.length < 200) break;
    startIndex += 200;
  }

  return map;
}

// 1 unit per video. Stops early if quota budget would be exceeded.
export async function fetchCommentsParallel(
  videoIds: string[],
  accessToken: string,
  onProgress?: (done: number, total: number) => void,
  quota?: QuotaBudget,
): Promise<Map<string, { text: string; author: string }[]>> {
  const map = new Map<string, { text: string; author: string }[]>();
  const BATCH = 5;

  for (let i = 0; i < videoIds.length; i += BATCH) {
    if (quota?.willExceed("commentThreads.list", BATCH)) {
      console.warn(`[youtube] Quota budget would be exceeded — skipping comments for ${videoIds.length - i} remaining videos`);
      break;
    }
    const batch = videoIds.slice(i, i + BATCH);
    const results = await Promise.all(batch.map((id) => getTopComments(id, accessToken)));
    batch.forEach((id, j) => {
      map.set(id, results[j]);
      quota?.charge("commentThreads.list");
    });
    onProgress?.(Math.min(i + BATCH, videoIds.length), videoIds.length);
  }

  return map;
}

async function getTopComments(videoId: string, accessToken: string): Promise<{ text: string; author: string }[]> {
  try {
    const params = new URLSearchParams({ videoId, part: "snippet", maxResults: "20", order: "relevance" });
    const res = await fetch(`${YT}/commentThreads?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items ?? []).map(
      (item: { snippet: { topLevelComment: { snippet: { textDisplay: string; authorDisplayName: string } } } }) => ({
        text: item.snippet.topLevelComment.snippet.textDisplay,
        author: item.snippet.topLevelComment.snippet.authorDisplayName ?? "Unknown",
      })
    );
  } catch {
    return [];
  }
}
