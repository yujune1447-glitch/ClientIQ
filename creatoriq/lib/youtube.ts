import type { RawVideo, VideoAnalytics } from "@/types";

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

export async function getUploadsPlaylistId(accessToken: string): Promise<string> {
  const data = await ytFetch(`${YT}/channels?part=contentDetails&mine=true`, accessToken);
  const id = data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!id) throw new Error("Could not find uploads playlist");
  return id;
}

export async function getAllVideoIds(
  playlistId: string,
  accessToken: string,
  onProgress: (count: number) => void
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({ playlistId, part: "contentDetails", maxResults: "50" });
    if (pageToken) params.set("pageToken", pageToken);
    const data = await ytFetch(`${YT}/playlistItems?${params}`, accessToken);
    ids.push(...(data.items ?? []).map((i: { contentDetails: { videoId: string } }) => i.contentDetails.videoId));
    pageToken = data.nextPageToken;
    onProgress(ids.length);
  } while (pageToken);

  return ids;
}

export async function getVideoDetails(
  ids: string[],
  accessToken: string,
  onProgress: (current: number, total: number) => void
): Promise<RawVideo[]> {
  const videos: RawVideo[] = [];

  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const params = new URLSearchParams({ id: batch.join(","), part: "snippet,statistics,contentDetails" });
    const data = await ytFetch(`${YT}/videos?${params}`, accessToken);
    videos.push(...(data.items ?? []));
    onProgress(videos.length, ids.length);
  }

  return videos;
}

export async function getChannelAnalytics(accessToken: string): Promise<Map<string, VideoAnalytics>> {
  const map = new Map<string, VideoAnalytics>();
  const metrics = "averageViewDuration,averageViewPercentage,impressions,impressionClickThroughRate";
  let startIndex = 1;

  while (true) {
    const params = new URLSearchParams({
      ids: "channel==mine",
      startDate: "2005-01-01",
      endDate: new Date().toISOString().slice(0, 10),
      metrics,
      dimensions: "video",
      maxResults: "500",
      startIndex: String(startIndex),
    });

    const res = await fetch(`${YT_ANALYTICS}?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    if (!res.ok || !data.rows?.length) break;

    for (const [videoId, avgDuration, avgPct, impressions, ctr] of data.rows) {
      map.set(videoId, {
        averageViewDuration: avgDuration,
        averageViewPercentage: avgPct,
        impressions,
        ctr,
      });
    }

    if (data.rows.length < 500) break;
    startIndex += 500;
  }

  return map;
}

export async function getTopComments(videoId: string, accessToken: string): Promise<string[]> {
  try {
    const params = new URLSearchParams({ videoId, part: "snippet", maxResults: "20", order: "relevance" });
    const res = await fetch(`${YT}/commentThreads?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items ?? []).map(
      (item: { snippet: { topLevelComment: { snippet: { textDisplay: string } } } }) =>
        item.snippet.topLevelComment.snippet.textDisplay
    );
  } catch {
    return [];
  }
}
