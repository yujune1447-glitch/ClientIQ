import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const YOUTUBE_CLIENT_ID = Deno.env.get("YOUTUBE_CLIENT_ID")!;
const YOUTUBE_CLIENT_SECRET = Deno.env.get("YOUTUBE_CLIENT_SECRET")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;
const TIKTOK_CLIENT_KEY = Deno.env.get("TIKTOK_CLIENT_KEY")!;
const TIKTOK_CLIENT_SECRET = Deno.env.get("TIKTOK_CLIENT_SECRET")!;
const INSTAGRAM_APP_ID = Deno.env.get("INSTAGRAM_APP_ID")!;
const INSTAGRAM_APP_SECRET = Deno.env.get("INSTAGRAM_APP_SECRET")!;

const YT = "https://www.googleapis.com/youtube/v3";
const YT_ANALYTICS = "https://youtubeanalytics.googleapis.com/v2/reports";
const FB = "https://graph.facebook.com/v18.0";
const TT = "https://open.tiktokapis.com/v2";

const STOP_WORDS = new Set([
  "the","a","an","and","or","but","in","on","at","to","for","of","with","by",
  "from","is","are","was","were","be","been","have","has","had","do","does",
  "did","will","would","could","should","that","this","these","those","i","you",
  "he","she","it","we","they","me","him","her","us","them","my","your","his",
  "its","our","their","what","how","why","when","who","which","just","get",
  "more","can","not","all","one","about","up","out","if","so",
]);

// ─── YouTube ──────────────────────────────────────────────────────────────────

async function ytFetch(url: string, token: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? `YouTube API ${res.status}`);
  return data;
}

async function refreshYtToken(rt: string): Promise<{ accessToken: string; expiresIn: number }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: YOUTUBE_CLIENT_ID, client_secret: YOUTUBE_CLIENT_SECRET, refresh_token: rt, grant_type: "refresh_token" }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("YT token refresh failed");
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

async function getChannelInfo(token: string): Promise<{ uploadsPlaylistId: string; subscriberCount: number; totalViews: number }> {
  const data = await ytFetch(`${YT}/channels?part=contentDetails,statistics&mine=true`, token);
  const item = data.items?.[0];
  if (!item) throw new Error("No channel found");
  return {
    uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads ?? "",
    subscriberCount: parseInt(item.statistics?.subscriberCount ?? "0"),
    totalViews: parseInt(item.statistics?.viewCount ?? "0"),
  };
}

async function getAllVideoIds(playlistId: string, token: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ playlistId, part: "contentDetails", maxResults: "50" });
    if (pageToken) params.set("pageToken", pageToken);
    const data = await ytFetch(`${YT}/playlistItems?${params}`, token);
    for (const item of data.items ?? []) {
      if (item.contentDetails?.videoId) ids.push(item.contentDetails.videoId);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return ids;
}

async function getVideoDetails(ids: string[], token: string) {
  const videos = [];
  for (let i = 0; i < ids.length; i += 50) {
    const params = new URLSearchParams({ id: ids.slice(i, i + 50).join(","), part: "snippet,statistics,contentDetails" });
    const data = await ytFetch(`${YT}/videos?${params}`, token);
    videos.push(...(data.items ?? []));
  }
  return videos;
}

async function getChannelAnalytics(token: string): Promise<Map<string, Record<string, number>>> {
  const map = new Map<string, Record<string, number>>();
  const metrics = "averageViewDuration,averageViewPercentage,impressions,impressionClickThroughRate";
  let startIndex = 1;
  while (true) {
    const params = new URLSearchParams({ ids: "channel==mine", startDate: "2005-01-01", endDate: new Date().toISOString().slice(0, 10), metrics, dimensions: "video", maxResults: "500", startIndex: String(startIndex) });
    const res = await fetch(`${YT_ANALYTICS}?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok || !data.rows?.length) break;
    for (const [videoId, avgDuration, avgPct, impressions, ctr] of data.rows) {
      map.set(videoId, { averageViewDuration: avgDuration, averageViewPercentage: avgPct, impressions, ctr });
    }
    if (data.rows.length < 500) break;
    startIndex += 500;
  }
  return map;
}

async function getTopComments(videoId: string, token: string): Promise<{ text: string; author: string }[]> {
  try {
    const params = new URLSearchParams({ videoId, part: "snippet", maxResults: "20", order: "relevance" });
    const res = await fetch(`${YT}/commentThreads?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items ?? []).map((item: { snippet: { topLevelComment: { snippet: { textDisplay: string; authorDisplayName: string } } } }) => ({
      text: item.snippet.topLevelComment.snippet.textDisplay,
      author: item.snippet.topLevelComment.snippet.authorDisplayName ?? "Unknown",
    }));
  } catch { return []; }
}

async function fetchComments(videoIds: string[], token: string): Promise<Map<string, { text: string; author: string }[]>> {
  const map = new Map<string, { text: string; author: string }[]>();
  for (let i = 0; i < videoIds.length; i += 5) {
    const batch = videoIds.slice(i, i + 5);
    const results = await Promise.all(batch.map((id) => getTopComments(id, token)));
    batch.forEach((id, j) => map.set(id, results[j]));
  }
  return map;
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

function scoreVideos(rawVideos: Record<string, unknown>[], analyticsMap: Map<string, Record<string, number>>) {
  const videos = rawVideos.map((raw) => {
    const r = raw as {
      id: string;
      snippet: { title: string; publishedAt: string; thumbnails: { medium?: { url: string }; default?: { url: string } } };
      statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
      contentDetails: { duration: string };
    };
    const a = analyticsMap.get(r.id);
    return {
      id: r.id, title: r.snippet.title, publishedAt: r.snippet.publishedAt,
      thumbnail: r.snippet.thumbnails.medium?.url ?? r.snippet.thumbnails.default?.url ?? "",
      viewCount: parseInt(r.statistics.viewCount ?? "0"),
      likeCount: parseInt(r.statistics.likeCount ?? "0"),
      commentCount: parseInt(r.statistics.commentCount ?? "0"),
      duration: r.contentDetails.duration,
      ctr: a?.ctr ?? 0, averageViewDuration: a?.averageViewDuration ?? 0,
      averageViewPercentage: a?.averageViewPercentage ?? 0, impressions: a?.impressions ?? 0,
      performanceScore: 0, viewsVsAverage: 0,
      topComments: [] as string[], topCommentAuthors: [] as string[],
    };
  });

  const n = videos.length || 1;
  const avgViews = videos.reduce((s, v) => s + v.viewCount, 0) / n;
  const avgLikes = videos.reduce((s, v) => s + v.likeCount, 0) / n;
  const avgComments = videos.reduce((s, v) => s + v.commentCount, 0) / n;
  const withCtr = videos.filter((v) => v.ctr > 0);
  const withRet = videos.filter((v) => v.averageViewPercentage > 0);
  const avgCtr = withCtr.length ? withCtr.reduce((s, v) => s + v.ctr, 0) / withCtr.length : 0;
  const avgRet = withRet.length ? withRet.reduce((s, v) => s + v.averageViewPercentage, 0) / withRet.length : 0;

  for (const v of videos) {
    const viewScore = avgViews > 0 ? v.viewCount / avgViews : 0;
    const ctrScore = avgCtr > 0 ? v.ctr / avgCtr : 0;
    const retScore = avgRet > 0 ? v.averageViewPercentage / avgRet : 0;
    v.performanceScore = Math.round((viewScore * 0.5 + ctrScore * 0.3 + retScore * 0.2) * 10) / 10;
    v.viewsVsAverage = avgViews > 0 ? Math.round((v.viewCount / avgViews - 1) * 100) : 0;
  }

  const sorted = [...videos].sort((a, b) => b.performanceScore - a.performanceScore);
  const variance = videos.reduce((s, v) => s + Math.pow(v.viewCount - avgViews, 2), 0) / n;
  const stdDev = Math.sqrt(variance);
  const outliers = videos.filter((v) => v.viewCount > avgViews + 2 * stdDev).sort((a, b) => b.viewCount - a.viewCount).slice(0, 5);
  const dates = videos.map((v) => v.publishedAt).sort();

  return {
    sorted, outliers,
    averages: {
      views: Math.round(avgViews), likes: Math.round(avgLikes), comments: Math.round(avgComments),
      ctr: Math.round(avgCtr * 100) / 100, retentionRate: Math.round(avgRet * 100) / 100,
    },
    dateRange: { from: dates[0] ?? "", to: dates[dates.length - 1] ?? "" },
  };
}

// ─── Niche ────────────────────────────────────────────────────────────────────

function parseDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] ?? "0") * 3600) + (parseInt(m[2] ?? "0") * 60) + parseInt(m[3] ?? "0");
}

function percentile(sorted: number[], p: number): number { return sorted[Math.floor(sorted.length * p)] ?? 0; }

function extractFormats(titles: string[]): string[] {
  const formats: string[] = [];
  const check = (re: RegExp, label: string) => { const n = titles.filter((t) => re.test(t)).length; if (n >= 3) formats.push(`${label} (${n}/${titles.length})`); };
  check(/^\d+\s|\b\d+\s+(ways|tips|things|steps|reasons|secrets|mistakes|rules)\b/i, "Number lists");
  check(/^how to/i, '"How to" format');
  check(/^why\s/i, '"Why..." format');
  check(/\b(i |my |i've |i'm )/i, "Personal/I-story");
  check(/\?$/, "Question format");
  return formats;
}

function extractPowerWords(titles: string[]): string[] {
  const freq: Record<string, number> = {};
  for (const title of titles) {
    for (const word of title.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/)) {
      if (word.length > 3 && !STOP_WORDS.has(word)) freq[word] = (freq[word] ?? 0) + 1;
    }
  }
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([w]) => w);
}

function extractHookPatterns(descriptions: string[]): string[] {
  const patterns: string[] = [];
  const top = descriptions.slice(0, 20);
  const withQ = top.filter((d) => d.includes("?")).length;
  if (withQ >= 4) patterns.push(`Open with a question (${withQ}/20 top videos)`);
  const withStat = top.filter((d) => /^\d/.test(d.trim())).length;
  if (withStat >= 3) patterns.push(`Open with a statistic (${withStat}/20 top videos)`);
  const withStory = top.filter((d) => /\bi (was|had|went|tried|thought)\b/i.test(d)).length;
  if (withStory >= 3) patterns.push(`Open with a personal story (${withStory}/20 top videos)`);
  return patterns;
}

async function searchNicheVideoIds(niche: string, token: string): Promise<string[]> {
  const params = new URLSearchParams({ q: niche, type: "video", order: "viewCount", maxResults: "50", part: "id", relevanceLanguage: "en" });
  const res = await fetch(`${YT}/search?${params}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? "Niche search failed");
  return (data.items ?? []).map((i: { id: { videoId: string } }) => i.id.videoId).filter(Boolean);
}

async function getNicheVideoDetails(ids: string[], token: string) {
  if (!ids.length) return [];
  const params = new URLSearchParams({ id: ids.join(","), part: "snippet,statistics,contentDetails" });
  const res = await fetch(`${YT}/videos?${params}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok) return [];
  return data.items ?? [];
}

function processNicheData(videos: Record<string, unknown>[], niche: string) {
  const items = (videos as { statistics?: { viewCount?: string }; contentDetails?: { duration?: string }; snippet?: { title?: string; description?: string } }[]).filter((v) => v.statistics?.viewCount);
  const sorted = [...items].sort((a, b) => parseInt(b.statistics!.viewCount!) - parseInt(a.statistics!.viewCount!));
  const views = sorted.map((v) => parseInt(v.statistics!.viewCount!));
  const durations = sorted.map((v) => parseDuration(v.contentDetails?.duration ?? "PT0S"));
  const titles = sorted.map((v) => v.snippet?.title ?? "");
  const descriptions = sorted.map((v) => (v.snippet?.description ?? "").slice(0, 300));
  const sortedViews = [...views].sort((a, b) => a - b);
  const sortedDurations = [...durations].filter((d) => d > 0).sort((a, b) => a - b);
  const topQ = sorted.slice(0, Math.ceil(sorted.length / 4));
  const topQDurations = topQ.map((v) => parseDuration(v.contentDetails?.duration ?? "PT0S")).filter((d) => d > 0);
  return {
    niche, videosAnalysed: sorted.length,
    titlePatterns: { commonFormats: extractFormats(titles), powerWords: extractPowerWords(titles), avgTitleLength: Math.round(titles.reduce((s, t) => s + t.length, 0) / (titles.length || 1)), topTitles: titles.slice(0, 5) },
    lengthInsights: { medianDurationSeconds: percentile(sortedDurations, 0.5), topPerformerRangeSeconds: [topQDurations.length ? Math.min(...topQDurations) : 0, topQDurations.length ? Math.max(...topQDurations) : 0] as [number, number], recommendation: `Top "${niche}" videos run ${Math.round(percentile(sortedDurations, 0.5) / 60)} min on average` },
    viewBenchmarks: { median: percentile(sortedViews, 0.5), topQuartile: percentile(sortedViews, 0.75), viral: percentile(sortedViews, 0.9) },
    topicClusters: extractPowerWords(titles).slice(0, 10),
    hookPatterns: extractHookPatterns(descriptions),
    topPerformers: sorted.slice(0, 10).map((v) => ({ title: v.snippet?.title ?? "", views: parseInt(v.statistics!.viewCount!), durationSeconds: parseDuration(v.contentDetails?.duration ?? "PT0S"), description: (v.snippet?.description ?? "").slice(0, 200) })),
  };
}

// ─── TikTok ───────────────────────────────────────────────────────────────────

async function refreshTikTokToken(rt: string): Promise<{ access_token: string; expires_in: number; refresh_token: string; refresh_expires_in: number } | null> {
  try {
    const res = await fetch(`${TT}/oauth/token/`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_key: TIKTOK_CLIENT_KEY, client_secret: TIKTOK_CLIENT_SECRET, grant_type: "refresh_token", refresh_token: rt }) });
    const d = await res.json();
    return d.access_token ? d : null;
  } catch { return null; }
}

async function fetchTikTokVideoComments(videoId: string, token: string): Promise<string[]> {
  try {
    const res = await fetch(`${TT}/video/comment/list/?fields=id,text,like_count,create_time&video_id=${videoId}&max_count=20`, { headers: { Authorization: `Bearer ${token}` } });
    const d = await res.json();
    if (!res.ok || d.error?.code !== "ok") return [];
    return (d.data?.comments ?? []).map((c: { text: string }) => c.text).filter(Boolean);
  } catch { return []; }
}

async function fetchTikTokVideos(token: string): Promise<Record<string, unknown>[]> {
  const fields = "id,title,video_description,duration,cover_image_url,share_url,like_count,comment_count,share_count,view_count,create_time";
  const all: Record<string, unknown>[] = [];
  let cursor = 0;
  let hasMore = true;
  while (hasMore && all.length < 50) {
    const res = await fetch(`${TT}/video/list/?fields=${fields}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ cursor, max_count: 20 }) });
    const d = await res.json();
    if (!res.ok || d.error?.code !== "ok") break;
    all.push(...(d.data?.videos ?? []));
    cursor = d.data?.cursor ?? 0;
    hasMore = d.data?.has_more ?? false;
    if (!d.data?.videos?.length) break;
  }
  return all;
}

function buildTikTokSummary(
  videos: Record<string, unknown>[],
  commentsByVideoId: Map<string, string[]>,
  displayName: string, followerCount: number, followingCount: number, likesCount: number, videoCount: number, avatarUrl: string
) {
  const enriched = videos.map((v) => ({
    id: String(v.id ?? ""),
    title: String(v.title ?? ""),
    video_description: String(v.video_description ?? ""),
    duration: Number(v.duration ?? 0),
    cover_image_url: String(v.cover_image_url ?? ""),
    share_url: String(v.share_url ?? ""),
    like_count: Number(v.like_count ?? 0),
    comment_count: Number(v.comment_count ?? 0),
    share_count: Number(v.share_count ?? 0),
    view_count: Number(v.view_count ?? 0),
    create_time: Number(v.create_time ?? 0),
    top_comments: commentsByVideoId.get(String(v.id ?? "")) ?? [],
  }));

  const n = enriched.length || 1;
  const avgViews = enriched.reduce((s, v) => s + v.view_count, 0) / n;
  const avgLikes = enriched.reduce((s, v) => s + v.like_count, 0) / n;
  const avgComments = enriched.reduce((s, v) => s + v.comment_count, 0) / n;
  const avgShares = enriched.reduce((s, v) => s + v.share_count, 0) / n;
  const engagementRate = followerCount > 0 ? ((avgLikes + avgComments + avgShares) / followerCount) * 100 : 0;
  const topVideos = [...enriched].sort((a, b) => b.view_count - a.view_count).slice(0, 10);

  return {
    displayName, followerCount, followingCount, likesCount, videoCount, avatarUrl,
    videos: enriched,
    averages: { views: Math.round(avgViews), likes: Math.round(avgLikes), comments: Math.round(avgComments), shares: Math.round(avgShares), engagementRate: Math.round(engagementRate * 100) / 100 },
    topVideos,
  };
}

// ─── Instagram ────────────────────────────────────────────────────────────────

async function refreshIgToken(userToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${FB}/oauth/access_token?grant_type=fb_exchange_token&client_id=${INSTAGRAM_APP_ID}&client_secret=${INSTAGRAM_APP_SECRET}&fb_exchange_token=${userToken}`);
    const d = await res.json();
    return d.access_token ?? null;
  } catch { return null; }
}

async function fetchInstagramPosts(igUserId: string, pageToken: string) {
  const posts: Record<string, unknown>[] = [];
  let cursor: string | undefined;
  do {
    const params = new URLSearchParams({ fields: "id,caption,media_type,timestamp,like_count,comments_count,media_url,permalink,thumbnail_url", limit: "50", access_token: pageToken });
    if (cursor) params.set("after", cursor);
    const res = await fetch(`${FB}/${igUserId}/media?${params}`);
    const d = await res.json();
    if (!res.ok || !d.data?.length) break;
    posts.push(...d.data.map((item: Record<string, unknown>) => ({
      id: item.id, caption: item.caption ?? "", media_type: item.media_type,
      timestamp: item.timestamp, like_count: item.like_count ?? 0,
      comments_count: item.comments_count ?? 0,
      media_url: item.media_url ?? item.thumbnail_url ?? "",
      permalink: item.permalink ?? "",
    })));
    cursor = (d.paging?.cursors?.after as string | undefined);
    if (!d.paging?.next || posts.length >= 50) break;
  } while (true);
  return posts.slice(0, 50);
}

async function getIgPostInsights(mediaId: string, mediaType: string, pageToken: string): Promise<{ impressions: number; reach: number; engagement: number; saved: number }> {
  try {
    const metrics = ["impressions", "reach", "engagement", "saved"];
    if (mediaType === "VIDEO") metrics.push("video_views");
    const res = await fetch(`${FB}/${mediaId}/insights?metric=${metrics.join(",")}&access_token=${pageToken}`);
    const d = await res.json();
    if (!res.ok) return { impressions: 0, reach: 0, engagement: 0, saved: 0 };
    const result: Record<string, number> = { impressions: 0, reach: 0, engagement: 0, saved: 0 };
    for (const item of d.data ?? []) result[item.name] = item.values?.[0]?.value ?? 0;
    return result as { impressions: number; reach: number; engagement: number; saved: number };
  } catch { return { impressions: 0, reach: 0, engagement: 0, saved: 0 }; }
}

async function getIgPostComments(mediaId: string, pageToken: string): Promise<string[]> {
  try {
    const params = new URLSearchParams({ fields: "text,timestamp", limit: "5", access_token: pageToken });
    const res = await fetch(`${FB}/${mediaId}/comments?${params}`);
    const d = await res.json();
    if (!res.ok) return [];
    return (d.data ?? []).map((c: { text: string }) => c.text).filter(Boolean);
  } catch { return []; }
}

async function buildInstagramSummary(
  igUserId: string, pageToken: string, followerCount: number, username: string, mediaCount: number, profilePictureUrl: string
) {
  const allPosts = await fetchInstagramPosts(igUserId, pageToken);
  const toAnalyse = allPosts.slice(0, 50);

  const BATCH = 10;
  const enriched: Record<string, unknown>[] = [];
  for (let i = 0; i < toAnalyse.length; i += BATCH) {
    const batch = toAnalyse.slice(i, i + BATCH);
    const insights = await Promise.all(batch.map((p) => getIgPostInsights(String(p.id), String(p.media_type), pageToken)));
    batch.forEach((post, j) => enriched.push({ ...post, ...insights[j] }));
  }

  const n = enriched.length || 1;
  const avgLikes = enriched.reduce((s, p) => s + Number(p.like_count ?? 0), 0) / n;
  const avgComments = enriched.reduce((s, p) => s + Number(p.comments_count ?? 0), 0) / n;
  const avgReach = enriched.reduce((s, p) => s + Number((p as Record<string, unknown>).reach ?? 0), 0) / n;
  const avgEngagement = enriched.reduce((s, p) => s + Number((p as Record<string, unknown>).engagement ?? 0), 0) / n;
  const engagementRate = followerCount > 0 ? ((avgLikes + avgComments) / followerCount) * 100 : 0;

  const sortedByEngagement = [...enriched].sort((a, b) => Number((b as Record<string, unknown>).engagement ?? 0) - Number((a as Record<string, unknown>).engagement ?? 0));
  const top5 = sortedByEngagement.slice(0, 5);
  const commentResults = await Promise.all(top5.map((p) => getIgPostComments(String(p.id), pageToken)));
  const top5WithComments = top5.map((p, i) => ({ ...p, topComments: commentResults[i] }));
  const topPosts = [...top5WithComments, ...sortedByEngagement.slice(5, 10)];

  const contentTypeBuckets: Record<string, { count: number; totalEngagement: number }> = {};
  for (const p of enriched) {
    const type = String(p.media_type ?? "IMAGE");
    if (!contentTypeBuckets[type]) contentTypeBuckets[type] = { count: 0, totalEngagement: 0 };
    contentTypeBuckets[type].count++;
    contentTypeBuckets[type].totalEngagement += Number((p as Record<string, unknown>).engagement ?? 0);
  }
  const contentTypeBreakdown = Object.entries(contentTypeBuckets).map(([type, { count, totalEngagement }]) => ({ type, count, avgEngagement: Math.round(totalEngagement / count) })).sort((a, b) => b.avgEngagement - a.avgEngagement);

  return {
    username, followerCount, mediaCount, profilePictureUrl,
    posts: enriched,
    averages: { likes: Math.round(avgLikes), comments: Math.round(avgComments), reach: Math.round(avgReach), engagement: Math.round(avgEngagement), engagementRate: Math.round(engagementRate * 100) / 100 },
    topPosts,
    contentTypeBreakdown,
  };
}

// ─── Comment Intelligence ─────────────────────────────────────────────────────

interface FlatComment { platform: string; videoTitle: string; tier: string; text: string; }

function collectComments(
  topPerformers: { title: string; topComments: string[] }[],
  bottomPerformers: { title: string; topComments: string[] }[],
  ttTopVideos: { title?: string; video_description?: string; top_comments?: string[] }[],
  igTopPosts: { caption?: string; media_type?: string; topComments?: string[] }[]
): FlatComment[] {
  const out: FlatComment[] = [];
  for (const v of topPerformers) for (const text of v.topComments ?? []) out.push({ platform: "youtube", videoTitle: v.title, tier: "top", text: text.slice(0, 200) });
  for (const v of bottomPerformers) for (const text of v.topComments ?? []) out.push({ platform: "youtube", videoTitle: v.title, tier: "bottom", text: text.slice(0, 200) });
  for (const v of ttTopVideos) { const title = v.title || (v.video_description ?? "").slice(0, 60) || "Untitled"; for (const text of v.top_comments ?? []) out.push({ platform: "tiktok", videoTitle: title, tier: "top", text: text.slice(0, 200) }); }
  for (const p of igTopPosts.slice(0, 5)) { const title = (p.caption ?? "").slice(0, 60) || String(p.media_type ?? "post"); for (const text of p.topComments ?? []) out.push({ platform: "instagram", videoTitle: title, tier: "top", text: text.slice(0, 200) }); }
  return out.slice(0, 300);
}

async function analyzeComments(
  topPerformers: { title: string; topComments: string[] }[],
  bottomPerformers: { title: string; topComments: string[] }[],
  ttTopVideos: { title?: string; video_description?: string; top_comments?: string[] }[],
  igTopPosts: { caption?: string; media_type?: string; topComments?: string[] }[],
  topCommenters: { author: string; count: number }[]
) {
  const comments = collectComments(topPerformers, bottomPerformers, ttTopVideos, igTopPosts);
  const empty = {
    totalCommentsAnalysed: comments.length, themes: [], videoIdeas: [],
    emotionalSignals: { excited: 0, grateful: 0, curious: 0, confused: 0, critical: 0, requesting: 0 },
    sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 },
    audiencePersonas: [], topCommenters: topCommenters.map((c) => ({ author: c.author, commentCount: c.count })),
    keyInsight: "Not enough comments to generate intelligence.", generatedAt: new Date().toISOString(),
  };
  if (comments.length < 10) return empty;

  const byVideo = new Map<string, FlatComment[]>();
  for (const c of comments) {
    const key = `[${c.platform.toUpperCase()}${c.tier === "top" ? " · top" : " · bottom"}] "${c.videoTitle.slice(0, 70)}"`;
    if (!byVideo.has(key)) byVideo.set(key, []);
    byVideo.get(key)!.push(c);
  }
  const body = Array.from(byVideo.entries()).map(([key, cs]) => `${key}\n${cs.map((c, i) => `  ${i + 1}. ${c.text}`).join("\n")}`).join("\n\n");

  const prompt = `Analyse the following ${comments.length} audience comments from a content creator's videos. Extract deep intelligence.\n\n${body}\n\nReturn ONLY a single JSON object — no markdown:\n{"themes":[{"name":"3-5 word label","description":"what this reveals","commentCount":0,"exampleComments":["quote1","quote2","quote3"],"sentiment":"positive|mixed|negative"}],"videoIdeas":[{"idea":"Specific actionable video title","sourceComment":"verbatim quote","estimatedDemand":"high|medium|low"}],"emotionalSignals":{"excited":0,"grateful":0,"curious":0,"confused":0,"critical":0,"requesting":0},"sentimentBreakdown":{"positive":0,"neutral":0,"negative":0},"audiencePersonas":[{"type":"Persona label","description":"who they are","cues":["signal1","signal2","signal3"]}],"keyInsight":"One sharp data-backed insight"}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 4096, system: "You are an expert audience intelligence analyst. Return only valid JSON.", messages: [{ role: "user", content: prompt }] }),
  });
  const data = await res.json();
  if (!res.ok) return empty;
  try {
    const raw = data.content?.[0]?.text ?? "";
    const text = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(text);
    return {
      totalCommentsAnalysed: comments.length,
      themes: parsed.themes ?? [], videoIdeas: parsed.videoIdeas ?? [],
      emotionalSignals: parsed.emotionalSignals ?? empty.emotionalSignals,
      sentimentBreakdown: parsed.sentimentBreakdown ?? empty.sentimentBreakdown,
      audiencePersonas: parsed.audiencePersonas ?? [],
      topCommenters: topCommenters.map((c) => ({ author: c.author, commentCount: c.count })),
      keyInsight: parsed.keyInsight ?? "", generatedAt: new Date().toISOString(),
    };
  } catch { return empty; }
}

// ─── Claude brief ─────────────────────────────────────────────────────────────

function fmt(n: number) { if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`; if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`; return String(n); }
function fmtSecs(s: number) { const m = Math.floor(s / 60); const sec = s % 60; return sec > 0 ? `${m}m ${sec}s` : `${m}m`; }

function buildPrompt(
  summary: Record<string, unknown>,
  nicheSummary: Record<string, unknown> | null,
  igSummary: Record<string, unknown> | null,
  ttSummary: Record<string, unknown> | null,
  commentIntel: Record<string, unknown> | null
): string {
  const { channel, averages, topPerformers, bottomPerformers, outliers, totalVideosAnalysed, dateRange } = summary as {
    channel: { title: string; handle?: string; subscriberCount: number };
    averages: { views: number; likes: number; comments: number; ctr: number; retentionRate: number };
    topPerformers: { title: string; viewCount: number; viewsVsAverage: number; performanceScore: number; ctr: number; averageViewPercentage: number; publishedAt: string; topComments: string[] }[];
    bottomPerformers: { title: string; viewCount: number; viewsVsAverage: number; performanceScore: number; ctr: number; averageViewPercentage: number; publishedAt: string; topComments: string[] }[];
    outliers: { title: string; viewCount: number }[];
    totalVideosAnalysed: number;
    dateRange: { from: string; to: string };
  };

  const fmtVideo = (v: typeof topPerformers[0], i: number) => {
    const comments = v.topComments?.slice(0, 5).map((c) => `"${c.slice(0, 120)}"`).join(" | ") ?? "none";
    return `${i + 1}. "${v.title}"\n   Views: ${fmt(v.viewCount)} (${v.viewsVsAverage > 0 ? "+" : ""}${v.viewsVsAverage}% vs avg) | Score: ${v.performanceScore}\n   CTR: ${v.ctr?.toFixed(2) ?? "N/A"}% | Retention: ${v.averageViewPercentage?.toFixed(1) ?? "N/A"}% | Published: ${v.publishedAt.slice(0, 10)}\n   Top comments: ${comments}`;
  };

  let prompt = `CHANNEL INTELLIGENCE REPORT\n${"=".repeat(30)}\nChannel: ${channel.title}${channel.handle ? ` (@${channel.handle})` : ""}\nSubscribers: ${fmt(channel.subscriberCount)}\nTotal videos: ${totalVideosAnalysed}\nDate range: ${String(dateRange.from).slice(0, 10)} → ${String(dateRange.to).slice(0, 10)}\n\nCHANNEL AVERAGES\nViews: ${fmt(averages.views)} | Likes: ${fmt(averages.likes)} | Comments: ${fmt(averages.comments)}\nCTR: ${averages.ctr}% | Retention: ${averages.retentionRate}%\n\nTOP 10 PERFORMING VIDEOS\n${topPerformers.map(fmtVideo).join("\n\n")}\n\nBOTTOM 10 PERFORMING VIDEOS\n${bottomPerformers.map(fmtVideo).join("\n\n")}\n\nOUTLIERS\n${outliers.length ? outliers.map((v, i) => `${i + 1}. "${v.title}" — ${fmt(v.viewCount)} views`).join("\n") : "None"}`;

  if (nicheSummary) {
    const n = nicheSummary as ReturnType<typeof processNicheData>;
    prompt += `\n\nNICHE INTELLIGENCE: "${n.niche}"\n${"=".repeat(40)}\nVideos analysed: ${n.videosAnalysed}\nBenchmarks — Median: ${fmt(n.viewBenchmarks.median)} | Top quartile: ${fmt(n.viewBenchmarks.topQuartile)} | Viral: ${fmt(n.viewBenchmarks.viral)}\nTitle formats: ${n.titlePatterns.commonFormats.join("; ") || "No dominant format"}\nPower words: ${n.titlePatterns.powerWords.join(", ")}\nOptimal length: ${n.lengthInsights.recommendation} | Range: ${fmtSecs(n.lengthInsights.topPerformerRangeSeconds[0])}–${fmtSecs(n.lengthInsights.topPerformerRangeSeconds[1])}\nTop 5 titles:\n${n.titlePatterns.topTitles.map((t, i) => `  ${i + 1}. "${t}"`).join("\n")}`;
  }

  if (igSummary) {
    const ig = igSummary as { username: string; followerCount: number; averages: { likes: number; comments: number; engagementRate: number }; topPosts: { media_type: string; caption?: string; like_count: number; comments_count: number; timestamp: string }[] };
    prompt += `\n\nINSTAGRAM INTELLIGENCE (@${ig.username})\n${"=".repeat(40)}\nFollowers: ${fmt(ig.followerCount)} | Avg likes: ${fmt(ig.averages.likes)} | Avg comments: ${fmt(ig.averages.comments)} | Engagement rate: ${ig.averages.engagementRate}%\nTop posts:\n${ig.topPosts.slice(0, 5).map((p, i) => `  ${i + 1}. [${p.media_type}] ${(p.caption ?? "").slice(0, 100) || "(no caption)"} | Likes: ${fmt(p.like_count)} | Comments: ${p.comments_count} | ${p.timestamp.slice(0, 10)}`).join("\n")}`;
  }

  if (ttSummary) {
    const tt = ttSummary as { displayName: string; followerCount: number; averages: { views: number; likes: number; shares: number; engagementRate: number }; topVideos: { title?: string; video_description?: string; view_count: number; like_count: number; share_count: number; duration: number; create_time: number }[] };
    prompt += `\n\nTIKTOK INTELLIGENCE (${tt.displayName})\n${"=".repeat(40)}\nFollowers: ${fmt(tt.followerCount)} | Avg views: ${fmt(tt.averages.views)} | Avg likes: ${fmt(tt.averages.likes)} | Avg shares: ${fmt(tt.averages.shares)} | Engagement: ${tt.averages.engagementRate}%\nTop videos:\n${tt.topVideos.slice(0, 5).map((v, i) => `  ${i + 1}. "${v.title || (v.video_description ?? "").slice(0, 80) || "(untitled)"}" — ${fmt(v.view_count)} views | ${fmt(v.like_count)} likes | ${v.duration}s | ${new Date(v.create_time * 1000).toISOString().slice(0, 10)}`).join("\n")}`;
  }

  if (commentIntel) {
    const ci = commentIntel as { totalCommentsAnalysed: number; keyInsight: string; sentimentBreakdown: { positive: number; neutral: number; negative: number }; emotionalSignals: Record<string, number>; themes: { name: string; description: string; commentCount: number; sentiment: string }[]; videoIdeas: { idea: string; sourceComment: string; estimatedDemand: string }[]; audiencePersonas: { type: string; description: string }[] };
    prompt += `\n\nAUDIENCE COMMENT INTELLIGENCE (${ci.totalCommentsAnalysed} comments)\n${"=".repeat(50)}`;
    if (ci.keyInsight) prompt += `\nKEY INSIGHT: ${ci.keyInsight}`;
    prompt += `\nSentiment: ${ci.sentimentBreakdown.positive}% positive | ${ci.sentimentBreakdown.neutral}% neutral | ${ci.sentimentBreakdown.negative}% negative`;
    prompt += `\nEmotional signals: Excited ${ci.emotionalSignals.excited}% | Curious ${ci.emotionalSignals.curious}% | Requesting ${ci.emotionalSignals.requesting}% | Confused ${ci.emotionalSignals.confused}%`;
    if (ci.themes.length) { prompt += `\nComment themes:`; for (const t of ci.themes) prompt += `\n  [${t.sentiment}] "${t.name}" (${t.commentCount} comments) — ${t.description}`; }
    if (ci.videoIdeas.length) { prompt += `\nAudience video requests:`; for (const idea of ci.videoIdeas) prompt += `\n  [${idea.estimatedDemand} demand] "${idea.idea}" — from: "${idea.sourceComment.slice(0, 100)}"`; }
    if (ci.audiencePersonas.length) { prompt += `\nAudience personas:`; for (const p of ci.audiencePersonas) prompt += `\n  ${p.type}: ${p.description}`; }
  }

  return prompt;
}

async function callClaude(prompt: string) {
  const system = `You are an expert YouTube content strategist with cross-platform intelligence. Every recommendation MUST cite a specific data point from the channel or niche data. Return ONLY valid JSON — no markdown:
{"brief":{"weeklyIdea":"specific video concept","titleOptions":["title using creator's best CTR pattern","title using niche format","curiosity-gap angle from comment signals"],"hook":{"openingLine":"exact first sentence","setup":"0-10s: what you establish","tension":"10-20s: conflict or curiosity gap","payoff":"20-30s: explicit value promise"},"recommendedLength":"specific duration with data reason","format":"production approach grounded in retention data","estimatedPerformance":"honest projection vs channel average citing comparable video","keyTalkingPoints":["point with data reason","point 2","point 3","point 4"],"thumbnail":{"concept":"one-sentence visual concept","colours":"specific palette with CTR data reason","composition":"layout and framing with data reason","textOverlay":"2-5 words max","faceExpression":"expression direction if relevant"},"dataEvidence":[{"claim":"Why this topic","evidence":"specific metric/video/stat"},{"claim":"Why this length","evidence":"specific data"},{"claim":"Why this thumbnail","evidence":"specific data"},{"claim":"Why this hook","evidence":"specific data"}]},"autopsy":{"overallTrend":"one honest sentence with numbers","whatIsWorking":["specific data-backed finding","finding 2","finding 3","finding 4"],"whatIsNotWorking":["specific data-backed finding","finding 2","finding 3"],"audienceInsights":"who this audience is with specifics","topPerformerPattern":"precise shared pattern with numbers","bottomPerformerPattern":"precise shared pattern with numbers","actionableAdvice":["specific action with rationale","action 2","action 3","action 4"]}}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 8000, system, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? "Anthropic API error");
  const raw = data.content?.[0]?.text ?? "";
  const text = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  return JSON.parse(text);
}

// ─── Snapshot helpers ─────────────────────────────────────────────────────────

const STOP_SET = new Set(["the","a","an","and","or","but","in","on","at","to","for","of","with","by","from","is","are","was","were","be","been","have","has","had","do","does","did","will","would","could","should","that","this","these","those","you","your","they","them","their","what","how","why","when","who","which","just","get","more","can","not","all","one","about","up","out","so","my","me","it"]);
function tokenize(text: string): string[] { return text.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((w) => w.length > 3 && !STOP_SET.has(w)); }

function detectBriefCompliance(newTitles: string[], prevBrief: Record<string, unknown> | null): { followed: boolean; matchTitle: string | null; matchScore: number } {
  if (!prevBrief || !newTitles.length) return { followed: false, matchTitle: null, matchScore: 0 };
  const keywords = new Set([
    ...tokenize(String(prevBrief.weeklyIdea ?? "")),
    ...((prevBrief.titleOptions as string[]) ?? []).flatMap(tokenize),
    ...((prevBrief.keyTalkingPoints as string[]) ?? []).flatMap(tokenize),
  ]);
  let bestTitle: string | null = null; let bestScore = 0;
  for (const title of newTitles) { const words = tokenize(title); const score = words.filter((w) => keywords.has(w)).length / Math.max(words.length, 1); if (score > bestScore) { bestScore = score; bestTitle = title; } }
  return { followed: bestScore >= 0.25, matchTitle: bestTitle, matchScore: Math.round(bestScore * 100) };
}

function detectFmt(title: string): string {
  if (/^\d+\s|\b\d+\s+(ways|tips|things|steps|reasons|secrets|mistakes|rules)\b/i.test(title)) return "Number list";
  if (/^how to/i.test(title)) return "How-to";
  if (/^why\s/i.test(title)) return "Why-format";
  if (/\b(i |my |i've |i'm )/i.test(title)) return "Personal story";
  if (/\?$/.test(title)) return "Question";
  return "Other";
}

function buildContentBreakdown(top: { title: string; performanceScore: number; viewCount: number }[], bottom: { title: string; performanceScore: number; viewCount: number }[]) {
  const buckets: Record<string, { count: number; totalScore: number; totalViews: number }> = {};
  for (const v of [...top, ...bottom]) { const f = detectFmt(v.title); if (!buckets[f]) buckets[f] = { count: 0, totalScore: 0, totalViews: 0 }; buckets[f].count++; buckets[f].totalScore += v.performanceScore; buckets[f].totalViews += v.viewCount; }
  return Object.entries(buckets).map(([format, { count, totalScore, totalViews }]) => ({ format, count, avgScore: Math.round((totalScore / count) * 10) / 10, avgViews: Math.round(totalViews / count) })).sort((a, b) => b.avgScore - a.avgScore);
}

// ─── Main processor ───────────────────────────────────────────────────────────

async function processCreator(
  conn: { id: string; user_id: string; refresh_token: string; access_token: string; token_expires_at: string; channel_id: string; channel_title: string; channel_handle?: string; channel_thumbnail?: string; subscriber_count: number; users: { niche?: string } },
  supabase: ReturnType<typeof createClient>
) {
  let accessToken = conn.access_token;
  if (new Date(conn.token_expires_at) <= new Date()) {
    const refreshed = await refreshYtToken(conn.refresh_token);
    accessToken = refreshed.accessToken;
    await supabase.from("youtube_connections").update({ access_token: accessToken, token_expires_at: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString() }).eq("id", conn.id);
  }

  const [channelInfo, { data: prevSnapshot }, { data: prevAnalysis }, { data: igConn }, { data: ttConn }] = await Promise.all([
    getChannelInfo(accessToken),
    supabase.from("channel_snapshots").select("created_at").eq("user_id", conn.user_id).eq("channel_id", conn.channel_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("analyses").select("brief, created_at").eq("user_id", conn.user_id).eq("channel_id", conn.channel_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("instagram_connections").select("*").eq("user_id", conn.user_id).maybeSingle(),
    supabase.from("tiktok_connections").select("*").eq("user_id", conn.user_id).maybeSingle(),
  ]);

  const videoIds = await getAllVideoIds(channelInfo.uploadsPlaylistId, accessToken);
  const rawVideos = await getVideoDetails(videoIds, accessToken);
  const analyticsMap = await getChannelAnalytics(accessToken);

  let nicheSummary = null;
  if (conn.users?.niche) {
    const nicheIds = await searchNicheVideoIds(conn.users.niche, accessToken);
    const nicheVideos = await getNicheVideoDetails(nicheIds, accessToken);
    nicheSummary = processNicheData(nicheVideos as Record<string, unknown>[], conn.users.niche);
  }

  // ── TikTok ────────────────────────────────────────────────────────────────
  let ttSummary = null;
  if (ttConn) {
    try {
      let ttToken: string = ttConn.access_token;
      if (ttConn.token_expires_at && new Date(ttConn.token_expires_at) <= new Date() && ttConn.refresh_token) {
        const refreshed = await refreshTikTokToken(ttConn.refresh_token);
        if (refreshed) {
          ttToken = refreshed.access_token;
          await supabase.from("tiktok_connections").update({ access_token: ttToken, token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(), refresh_token: refreshed.refresh_token, refresh_token_expires_at: new Date(Date.now() + refreshed.refresh_expires_in * 1000).toISOString() }).eq("id", ttConn.id);
        }
      }
      const videos = await fetchTikTokVideos(ttToken);
      const sorted = [...videos].sort((a, b) => Number(b.view_count ?? 0) - Number(a.view_count ?? 0));
      const top10Ids = sorted.slice(0, 10).map((v) => String(v.id ?? ""));
      const commentsByVideoId = new Map<string, string[]>();
      for (const id of top10Ids) commentsByVideoId.set(id, await fetchTikTokVideoComments(id, ttToken));
      ttSummary = buildTikTokSummary(videos, commentsByVideoId, ttConn.display_name ?? "", ttConn.follower_count ?? 0, ttConn.following_count ?? 0, ttConn.likes_count ?? 0, ttConn.video_count ?? 0, ttConn.avatar_url ?? "");
    } catch { /* skip */ }
  }

  // ── Instagram ─────────────────────────────────────────────────────────────
  let igSummary = null;
  if (igConn) {
    try {
      let pageToken: string = igConn.page_access_token;
      if (igConn.token_expires_at && new Date(igConn.token_expires_at) <= new Date()) {
        const refreshed = await refreshIgToken(igConn.user_access_token);
        if (refreshed) {
          pageToken = refreshed;
          await supabase.from("instagram_connections").update({ page_access_token: pageToken, token_expires_at: new Date(Date.now() + 5184000 * 1000).toISOString() }).eq("id", igConn.id);
        }
      }
      igSummary = await buildInstagramSummary(igConn.ig_user_id, pageToken, igConn.follower_count ?? 0, igConn.username ?? "", igConn.media_count ?? 0, igConn.profile_picture_url ?? "");
    } catch { /* skip */ }
  }

  // ── Score + comments ──────────────────────────────────────────────────────
  const scored = scoreVideos(rawVideos as Record<string, unknown>[], analyticsMap);
  const commentTargetIds = [...scored.sorted.slice(0, 10), ...scored.sorted.slice(-10).reverse()].map((v) => v.id);
  const commentsMap = await fetchComments(commentTargetIds, accessToken);

  const authorCounts = new Map<string, number>();
  const attach = (v: ReturnType<typeof scoreVideos>["sorted"][0]) => {
    const comments = commentsMap.get(v.id) ?? [];
    for (const c of comments) { if (c.author && c.author !== "Unknown") authorCounts.set(c.author, (authorCounts.get(c.author) ?? 0) + 1); }
    return { ...v, topComments: comments.map((c) => c.text), topCommentAuthors: comments.map((c) => c.author) };
  };

  const topPerformers = scored.sorted.slice(0, 10).map(attach);
  const bottomPerformers = scored.sorted.slice(-10).reverse().map(attach);
  const topCommenters = Array.from(authorCounts.entries()).filter(([, c]) => c >= 2).sort(([, a], [, b]) => b - a).slice(0, 10).map(([author, count]) => ({ author, count }));

  const channel = { id: conn.channel_id, title: conn.channel_title, handle: conn.channel_handle ?? "", thumbnail: conn.channel_thumbnail ?? "", subscriberCount: channelInfo.subscriberCount, totalViews: channelInfo.totalViews, videoCount: videoIds.length };

  const summary = {
    channel, averages: scored.averages, topPerformers, bottomPerformers,
    outliers: scored.outliers, totalVideosAnalysed: scored.sorted.length,
    dateRange: scored.dateRange, topCommenters: topCommenters.length > 0 ? topCommenters : undefined,
  };

  // ── Comment intelligence ──────────────────────────────────────────────────
  const commentIntelligence = await analyzeComments(
    topPerformers, bottomPerformers,
    ttSummary?.topVideos ?? [],
    (igSummary?.topPosts as { caption?: string; media_type?: string; topComments?: string[] }[] | undefined) ?? [],
    topCommenters
  );

  // ── Claude brief ──────────────────────────────────────────────────────────
  const prompt = buildPrompt(
    summary as unknown as Record<string, unknown>,
    nicheSummary as unknown as Record<string, unknown> | null,
    igSummary as unknown as Record<string, unknown> | null,
    ttSummary as unknown as Record<string, unknown> | null,
    commentIntelligence as unknown as Record<string, unknown>
  );
  const { brief, autopsy } = await callClaude(prompt);

  // ── Persist ───────────────────────────────────────────────────────────────
  const { data: analysis } = await supabase.from("analyses").insert({
    user_id: conn.user_id,
    channel_id: conn.channel_id,
    raw_videos: rawVideos,
    summary,
    brief,
    autopsy,
    total_videos: videoIds.length,
    instagram_summary: igSummary,
    tiktok_summary: ttSummary,
    comment_intelligence: commentIntelligence,
    is_unread: true,
    generated_by: "scheduled",
  }).select("id").single();

  if (analysis) {
    const prevDate = prevSnapshot?.created_at ? new Date(prevSnapshot.created_at) : new Date(0);
    const newTitles = (rawVideos as Record<string, unknown>[]).filter((v) => new Date(String((v.snippet as Record<string, unknown>)?.publishedAt ?? "")) > prevDate).map((v) => String((v.snippet as Record<string, unknown>)?.title ?? ""));
    const { followed, matchTitle, matchScore } = detectBriefCompliance(newTitles, prevAnalysis?.brief as Record<string, unknown> | null);
    const top = scored.sorted[0];
    const contentBreakdown = buildContentBreakdown(topPerformers, bottomPerformers);

    await supabase.from("channel_snapshots").insert({
      user_id: conn.user_id, channel_id: conn.channel_id, analysis_id: analysis.id,
      subscriber_count: channelInfo.subscriberCount, avg_ctr: scored.averages.ctr,
      avg_retention: scored.averages.retentionRate, avg_views_per_video: scored.averages.views,
      total_videos_analysed: scored.sorted.length,
      top_video_id: top?.id ?? null, top_video_title: top?.title ?? null,
      top_video_views: top?.viewCount ?? null, top_video_score: top?.performanceScore ?? null,
      top_video_published_at: top?.publishedAt ?? null,
      new_videos_count: newTitles.length,
      brief_followed: prevAnalysis ? followed : null,
      brief_match_video_title: matchTitle,
      brief_match_score: prevAnalysis ? matchScore : null,
      content_breakdown: contentBreakdown,
      comment_sentiment: commentIntelligence.sentimentBreakdown,
    });
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.headers.get("Authorization") !== `Bearer ${CRON_SECRET}`) return new Response("Unauthorized", { status: 401 });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: connections } = await supabase.from("youtube_connections").select("*, users!inner(niche)").not("refresh_token", "is", null);

  const results: { userId: string; status: string; error?: string }[] = [];
  const START = Date.now();

  for (const conn of connections ?? []) {
    if (Date.now() - START > 120_000) { results.push({ userId: conn.user_id, status: "skipped", error: "time limit" }); continue; }
    try { await processCreator(conn, supabase); results.push({ userId: conn.user_id, status: "ok" }); }
    catch (err) { results.push({ userId: conn.user_id, status: "error", error: err instanceof Error ? err.message : String(err) }); }
  }

  return Response.json({ processed: results.length, results });
});
