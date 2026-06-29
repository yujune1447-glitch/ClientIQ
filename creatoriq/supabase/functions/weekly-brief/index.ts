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

const STOP_WORDS = new Set([
  "the","a","an","and","or","but","in","on","at","to","for","of","with","by",
  "from","is","are","was","were","be","been","have","has","had","do","does",
  "did","will","would","could","should","that","this","these","those","i","you",
  "he","she","it","we","they","me","him","her","us","them","my","your","his",
  "its","our","their","what","how","why","when","who","which","just","get",
  "more","can","not","all","one","about","up","out","if","so",
]);

async function ytFetch(url: string, token: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? `YouTube API ${res.status}`);
  return data;
}

async function refreshToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: YOUTUBE_CLIENT_ID,
      client_secret: YOUTUBE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Token refresh failed");
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
    const batch = ids.slice(i, i + 50);
    const params = new URLSearchParams({ id: batch.join(","), part: "snippet,statistics,contentDetails" });
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
    const params = new URLSearchParams({
      ids: "channel==mine",
      startDate: "2005-01-01",
      endDate: new Date().toISOString().slice(0, 10),
      metrics,
      dimensions: "video",
      maxResults: "500",
      startIndex: String(startIndex),
    });
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

async function getTopComments(videoId: string, token: string): Promise<string[]> {
  try {
    const params = new URLSearchParams({ videoId, part: "snippet", maxResults: "20", order: "relevance" });
    const res = await fetch(`${YT}/commentThreads?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items ?? []).map((item: { snippet: { topLevelComment: { snippet: { textDisplay: string } } } }) =>
      item.snippet.topLevelComment.snippet.textDisplay
    );
  } catch {
    return [];
  }
}

async function fetchComments(videoIds: string[], token: string): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  for (let i = 0; i < videoIds.length; i += 5) {
    const batch = videoIds.slice(i, i + 5);
    const results = await Promise.all(batch.map((id) => getTopComments(id, token)));
    batch.forEach((id, j) => map.set(id, results[j]));
  }
  return map;
}

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
      id: r.id,
      title: r.snippet.title,
      publishedAt: r.snippet.publishedAt,
      thumbnail: r.snippet.thumbnails.medium?.url ?? r.snippet.thumbnails.default?.url ?? "",
      viewCount: parseInt(r.statistics.viewCount ?? "0"),
      likeCount: parseInt(r.statistics.likeCount ?? "0"),
      commentCount: parseInt(r.statistics.commentCount ?? "0"),
      duration: r.contentDetails.duration,
      ctr: a?.ctr ?? 0,
      averageViewDuration: a?.averageViewDuration ?? 0,
      averageViewPercentage: a?.averageViewPercentage ?? 0,
      impressions: a?.impressions ?? 0,
      performanceScore: 0,
      viewsVsAverage: 0,
      topComments: [] as string[],
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
  const outliers = videos.filter((v) => v.viewCount > avgViews + 2 * stdDev)
    .sort((a, b) => b.viewCount - a.viewCount).slice(0, 5);
  const dates = videos.map((v) => v.publishedAt).sort();

  return {
    sorted,
    averages: {
      views: Math.round(avgViews),
      likes: Math.round(avgLikes),
      comments: Math.round(avgComments),
      ctr: Math.round(avgCtr * 100) / 100,
      retentionRate: Math.round(avgRet * 100) / 100,
    },
    outliers,
    dateRange: { from: dates[0] ?? "", to: dates[dates.length - 1] ?? "" },
  };
}

function parseDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] ?? "0") * 3600) + (parseInt(m[2] ?? "0") * 60) + parseInt(m[3] ?? "0");
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.floor(sorted.length * p)] ?? 0;
}

function extractFormats(titles: string[]): string[] {
  const formats: string[] = [];
  const check = (re: RegExp, label: string) => {
    const n = titles.filter((t) => re.test(t)).length;
    if (n >= 3) formats.push(`${label} (${n} of ${titles.length} top videos)`);
  };
  check(/^\d+\s|\b\d+\s+(ways|tips|things|steps|reasons|secrets|mistakes|rules)\b/i, "Number lists");
  check(/^how to/i, '"How to" format');
  check(/^why\s/i, '"Why..." format');
  check(/\b(i |my |i\'ve |i\'m )/i, "Personal / I-story format");
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
  if (withStat >= 3) patterns.push(`Open with a statistic or number (${withStat}/20 top videos)`);
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
  if (!res.ok) throw new Error(data.error?.message ?? "Niche details failed");
  return data.items ?? [];
}

function processNicheData(videos: Record<string, unknown>[], niche: string) {
  const items = (videos as {
    statistics?: { viewCount?: string };
    contentDetails?: { duration?: string };
    snippet?: { title?: string; description?: string };
  }[]).filter((v) => v.statistics?.viewCount);

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
    niche,
    videosAnalysed: sorted.length,
    titlePatterns: {
      commonFormats: extractFormats(titles),
      powerWords: extractPowerWords(titles),
      avgTitleLength: Math.round(titles.reduce((s, t) => s + t.length, 0) / (titles.length || 1)),
      topTitles: titles.slice(0, 5),
    },
    lengthInsights: {
      medianDurationSeconds: percentile(sortedDurations, 0.5),
      topPerformerRangeSeconds: [
        topQDurations.length ? Math.min(...topQDurations) : 0,
        topQDurations.length ? Math.max(...topQDurations) : 0,
      ],
      recommendation: `Top "${niche}" videos run ${Math.round(percentile(sortedDurations, 0.5) / 60)} min on average`,
    },
    viewBenchmarks: {
      median: percentile(sortedViews, 0.5),
      topQuartile: percentile(sortedViews, 0.75),
      viral: percentile(sortedViews, 0.9),
    },
    topicClusters: extractPowerWords(titles).slice(0, 10),
    hookPatterns: extractHookPatterns(descriptions),
    topPerformers: sorted.slice(0, 10).map((v) => ({
      title: v.snippet?.title ?? "",
      views: parseInt(v.statistics!.viewCount!),
      durationSeconds: parseDuration(v.contentDetails?.duration ?? "PT0S"),
      description: (v.snippet?.description ?? "").slice(0, 200),
    })),
  };
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtSecs(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return sec > 0 ? `${m}m ${sec}s` : `${m}m`;
}

function buildPrompt(summary: Record<string, unknown>, nicheSummary: Record<string, unknown> | null, igSummary: IgSummaryData | null = null, ttSummary: TikTokSummaryData | null = null): string {
  const { channel, averages, topPerformers, bottomPerformers, outliers, totalVideosAnalysed, dateRange } = summary as {
    channel: { title: string; handle?: string; subscriberCount: number };
    averages: { views: number; likes: number; comments: number; ctr: number; retentionRate: number };
    topPerformers: { title: string; viewCount: number; viewsVsAverage: number; performanceScore: number; ctr: number; averageViewPercentage: number; publishedAt: string; topComments: string[] }[];
    bottomPerformers: { title: string; viewCount: number; viewsVsAverage: number; performanceScore: number; ctr: number; averageViewPercentage: number; publishedAt: string; topComments: string[] }[];
    outliers: { title: string; viewCount: number; viewsVsAverage: number; performanceScore: number }[];
    totalVideosAnalysed: number;
    dateRange: { from: string; to: string };
  };

  const fmtVideo = (v: typeof topPerformers[0], i: number) => {
    const comments = v.topComments?.slice(0, 5).map((c) => `"${c.slice(0, 120)}"`).join(" | ") ?? "none";
    return `${i + 1}. "${v.title}"
   Views: ${fmt(v.viewCount)} (${v.viewsVsAverage > 0 ? "+" : ""}${v.viewsVsAverage}% vs avg) | Score: ${v.performanceScore}
   CTR: ${v.ctr?.toFixed(2) ?? "N/A"}% | Retention: ${v.averageViewPercentage?.toFixed(1) ?? "N/A"}% | Published: ${v.publishedAt.slice(0, 10)}
   Top comments: ${comments}`;
  };

  let prompt = `CHANNEL INTELLIGENCE REPORT
===========================
Channel: ${channel.title}${channel.handle ? ` (@${channel.handle})` : ""}
Subscribers: ${fmt(channel.subscriberCount)}
Total videos analysed: ${totalVideosAnalysed}
Date range: ${String(dateRange.from).slice(0, 10)} → ${String(dateRange.to).slice(0, 10)}

CHANNEL AVERAGES
Views/video: ${fmt(averages.views)} | Likes/video: ${fmt(averages.likes)} | Comments/video: ${fmt(averages.comments)}
CTR: ${averages.ctr}% | Retention: ${averages.retentionRate}%

TOP 10 PERFORMING VIDEOS
${topPerformers.map(fmtVideo).join("\n\n")}

BOTTOM 10 PERFORMING VIDEOS
${bottomPerformers.map(fmtVideo).join("\n\n")}

OUTLIER VIDEOS (>2 std deviations above average)
${outliers.length ? outliers.map((v, i) => `${i + 1}. "${v.title}" — ${fmt(v.viewCount)} views`).join("\n") : "None identified"}`;

  if (nicheSummary) {
    const n = nicheSummary as ReturnType<typeof processNicheData>;
    prompt += `

NICHE INTELLIGENCE: "${n.niche}"
=====================================
Public videos analysed: ${n.videosAnalysed}

VIEW BENCHMARKS
Median: ${fmt(n.viewBenchmarks.median)} | Top quartile: ${fmt(n.viewBenchmarks.topQuartile)} | Viral: ${fmt(n.viewBenchmarks.viral)}

TITLE PATTERNS
Common formats: ${n.titlePatterns.commonFormats.join("; ") || "No dominant format"}
Power words: ${n.titlePatterns.powerWords.join(", ")}

OPTIMAL VIDEO LENGTH
${n.lengthInsights.recommendation}
Median: ${fmtSecs(n.lengthInsights.medianDurationSeconds)} | Top quartile: ${fmtSecs(n.lengthInsights.topPerformerRangeSeconds[0])}–${fmtSecs(n.lengthInsights.topPerformerRangeSeconds[1])}

TOP 5 NICHE TITLES
${n.titlePatterns.topTitles.map((t, i) => `${i + 1}. "${t}"`).join("\n")}`;
  }

  if (igSummary) {
    prompt += `

INSTAGRAM INTELLIGENCE (@${igSummary.username})
=========================================
Followers: ${fmt(igSummary.followerCount)}
Avg likes: ${fmt(igSummary.averages.likes)} | Avg comments: ${fmt(igSummary.averages.comments)} | Engagement rate: ${igSummary.averages.engagementRate}%

TOP 10 INSTAGRAM POSTS BY ENGAGEMENT
${igSummary.topPosts.map((p, i) => `${i + 1}. [${p.media_type}] ${(p.caption ?? "").slice(0, 100) || "(no caption)"} | Likes: ${fmt(p.like_count ?? 0)} | Comments: ${p.comments_count ?? 0} | Posted: ${p.timestamp.slice(0, 10)}`).join("\n")}`;
  }

  if (ttSummary) {
    prompt += `

TIKTOK INTELLIGENCE (${ttSummary.displayName})
=========================================
Followers: ${fmt(ttSummary.followerCount)} | Videos analysed: ${ttSummary.topVideos.length}
Avg views: ${fmt(ttSummary.averages.views)} | Avg likes: ${fmt(ttSummary.averages.likes)} | Avg shares: ${fmt(ttSummary.averages.shares)} | Engagement rate: ${ttSummary.averages.engagementRate}%

TOP 10 TIKTOK VIDEOS BY VIEWS
${ttSummary.topVideos.map((v, i) => {
  const title = v.title || (v.video_description ?? "").slice(0, 80) || "(untitled)";
  const date = v.create_time ? new Date(v.create_time * 1000).toISOString().slice(0, 10) : "unknown";
  return `${i + 1}. "${title}" — ${fmt(v.view_count ?? 0)} views | ${fmt(v.like_count ?? 0)} likes | ${fmt(v.share_count ?? 0)} shares | ${v.duration ?? 0}s | ${date}`;
}).join("\n")}`;
  }

  return prompt;
}

async function callClaude(prompt: string) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: `You are an expert YouTube content strategist with cross-platform intelligence from Instagram and TikTok where available. Return a single JSON object — no markdown, no explanation, only valid JSON:
{"brief":{"weeklyIdea":"string","rationale":"string","hook":"string","format":"string","estimatedPerformance":"string","keyTalkingPoints":["..."],"thumbnailDirection":"string","titleOptions":["..."]},"autopsy":{"overallTrend":"string","whatIsWorking":["..."],"whatIsNotWorking":["..."],"audienceInsights":"string","topPerformerPattern":"string","bottomPerformerPattern":"string","actionableAdvice":["..."]}}`,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? "Anthropic API error");
  const raw = data.content?.[0]?.text ?? "";
  const text = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  return JSON.parse(text);
}

const STOP_SET = new Set([
  "the","a","an","and","or","but","in","on","at","to","for","of","with","by",
  "from","is","are","was","were","be","been","have","has","had","do","does",
  "did","will","would","could","should","that","this","these","those","you",
  "your","they","them","their","what","how","why","when","who","which","just",
  "get","more","can","not","all","one","about","up","out","so","my","me","it",
]);

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(
    (w) => w.length > 3 && !STOP_SET.has(w)
  );
}

function detectBriefCompliance(
  newVideoTitles: string[],
  prevBrief: Record<string, unknown> | null
): { followed: boolean; matchTitle: string | null; matchScore: number } {
  if (!prevBrief || !newVideoTitles.length) return { followed: false, matchTitle: null, matchScore: 0 };
  const keywords = new Set([
    ...tokenize(String(prevBrief.weeklyIdea ?? "")),
    ...((prevBrief.titleOptions as string[]) ?? []).flatMap(tokenize),
    ...((prevBrief.keyTalkingPoints as string[]) ?? []).flatMap(tokenize),
  ]);
  let bestTitle: string | null = null;
  let bestScore = 0;
  for (const title of newVideoTitles) {
    const words = tokenize(title);
    const overlap = words.filter((w) => keywords.has(w)).length;
    const score = overlap / Math.max(words.length, 1);
    if (score > bestScore) { bestScore = score; bestTitle = title; }
  }
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

function buildContentBreakdown(topPerformers: ReturnType<typeof scoreVideos>["sorted"], bottomPerformers: ReturnType<typeof scoreVideos>["sorted"]) {
  const buckets: Record<string, { count: number; totalScore: number; totalViews: number }> = {};
  for (const v of [...topPerformers, ...bottomPerformers]) {
    const f = detectFmt(v.title);
    if (!buckets[f]) buckets[f] = { count: 0, totalScore: 0, totalViews: 0 };
    buckets[f].count++;
    buckets[f].totalScore += v.performanceScore;
    buckets[f].totalViews += v.viewCount;
  }
  return Object.entries(buckets).map(([format, { count, totalScore, totalViews }]) => ({
    format, count,
    avgScore: Math.round((totalScore / count) * 10) / 10,
    avgViews: Math.round(totalViews / count),
  })).sort((a, b) => b.avgScore - a.avgScore);
}

// ─── TikTok helpers ────────────────────────────────────────────────────────

async function refreshTikTokToken(rt: string): Promise<{ access_token: string; expires_in: number; refresh_token: string; refresh_expires_in: number } | null> {
  try {
    const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_key: TIKTOK_CLIENT_KEY, client_secret: TIKTOK_CLIENT_SECRET, grant_type: "refresh_token", refresh_token: rt }),
    });
    const d = await res.json();
    return d.access_token ? d : null;
  } catch { return null; }
}

interface TikTokVideoItem {
  id: string; title?: string; video_description?: string; duration?: number;
  like_count?: number; comment_count?: number; share_count?: number; view_count?: number; create_time?: number;
}

async function fetchTikTokVideos(token: string): Promise<TikTokVideoItem[]> {
  const fields = "id,title,video_description,duration,like_count,comment_count,share_count,view_count,create_time";
  const all: TikTokVideoItem[] = [];
  let cursor = 0;
  let hasMore = true;
  while (hasMore && all.length < 50) {
    const res = await fetch(`https://open.tiktokapis.com/v2/video/list/?fields=${fields}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ cursor, max_count: 20 }),
    });
    const d = await res.json();
    if (!res.ok || d.error?.code !== "ok") break;
    all.push(...(d.data?.videos ?? []));
    cursor = d.data?.cursor ?? 0;
    hasMore = d.data?.has_more ?? false;
    if (!d.data?.videos?.length) break;
  }
  return all;
}

interface TikTokSummaryData {
  displayName: string; followerCount: number; videoCount: number;
  averages: { views: number; likes: number; comments: number; shares: number; engagementRate: number };
  topVideos: TikTokVideoItem[];
}

function buildTikTokSummaryData(videos: TikTokVideoItem[], displayName: string, followerCount: number, videoCount: number): TikTokSummaryData {
  const n = videos.length || 1;
  const avgViews = videos.reduce((s, v) => s + (v.view_count ?? 0), 0) / n;
  const avgLikes = videos.reduce((s, v) => s + (v.like_count ?? 0), 0) / n;
  const avgComments = videos.reduce((s, v) => s + (v.comment_count ?? 0), 0) / n;
  const avgShares = videos.reduce((s, v) => s + (v.share_count ?? 0), 0) / n;
  const engagementRate = followerCount > 0 ? ((avgLikes + avgComments + avgShares) / followerCount) * 100 : 0;
  const topVideos = [...videos].sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0)).slice(0, 10);
  return {
    displayName, followerCount, videoCount,
    averages: {
      views: Math.round(avgViews), likes: Math.round(avgLikes),
      comments: Math.round(avgComments), shares: Math.round(avgShares),
      engagementRate: Math.round(engagementRate * 100) / 100,
    },
    topVideos,
  };
}

// ─── Instagram helpers ────────────────────────────────────────────────────

const FB = "https://graph.facebook.com/v18.0";

interface IgPostItem {
  id: string; caption?: string; media_type: string; timestamp: string;
  like_count?: number; comments_count?: number; permalink?: string;
}

async function fetchInstagramPosts(igUserId: string, pageToken: string): Promise<IgPostItem[]> {
  const posts: IgPostItem[] = [];
  let cursor: string | undefined;
  do {
    const params = new URLSearchParams({ fields: "id,caption,media_type,timestamp,like_count,comments_count,permalink", limit: "50", access_token: pageToken });
    if (cursor) params.set("after", cursor);
    const res = await fetch(`${FB}/${igUserId}/media?${params}`);
    const d = await res.json();
    if (!res.ok || !d.data?.length) break;
    posts.push(...d.data);
    cursor = d.paging?.cursors?.after;
    if (!d.paging?.next || posts.length >= 50) break;
  } while (true);
  return posts.slice(0, 50);
}

interface IgSummaryData {
  username: string; followerCount: number;
  averages: { likes: number; comments: number; engagementRate: number };
  topPosts: IgPostItem[];
}

function buildIgSummaryData(posts: IgPostItem[], username: string, followerCount: number): IgSummaryData {
  const n = posts.length || 1;
  const avgLikes = posts.reduce((s, p) => s + (p.like_count ?? 0), 0) / n;
  const avgComments = posts.reduce((s, p) => s + (p.comments_count ?? 0), 0) / n;
  const engagementRate = followerCount > 0 ? ((avgLikes + avgComments) / followerCount) * 100 : 0;
  const topPosts = [...posts].sort((a, b) => ((b.like_count ?? 0) + (b.comments_count ?? 0)) - ((a.like_count ?? 0) + (a.comments_count ?? 0))).slice(0, 10);
  return { username, followerCount, averages: { likes: Math.round(avgLikes), comments: Math.round(avgComments), engagementRate: Math.round(engagementRate * 100) / 100 }, topPosts };
}

async function refreshIgToken(userToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${FB}/oauth/access_token?grant_type=fb_exchange_token&client_id=${INSTAGRAM_APP_ID}&client_secret=${INSTAGRAM_APP_SECRET}&fb_exchange_token=${userToken}`);
    const d = await res.json();
    return d.access_token ?? null;
  } catch { return null; }
}

async function processCreator(
  conn: { id: string; user_id: string; refresh_token: string; access_token: string; token_expires_at: string; channel_id: string; channel_title: string; channel_handle?: string; channel_thumbnail?: string; subscriber_count: number; users: { niche?: string } },
  supabase: ReturnType<typeof createClient>
) {
  let accessToken = conn.access_token;

  if (new Date(conn.token_expires_at) <= new Date()) {
    const refreshed = await refreshToken(conn.refresh_token);
    accessToken = refreshed.accessToken;
    await supabase.from("youtube_connections").update({
      access_token: accessToken,
      token_expires_at: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
    }).eq("id", conn.id);
  }

  const [channelInfo, { data: prevSnapshot }, { data: prevAnalysis }] = await Promise.all([
    getChannelInfo(accessToken),
    supabase.from("channel_snapshots").select("created_at").eq("user_id", conn.user_id).eq("channel_id", conn.channel_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("analyses").select("brief, created_at").eq("user_id", conn.user_id).eq("channel_id", conn.channel_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
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

  const [{ data: igConn }, { data: ttConn }] = await Promise.all([
    supabase.from("instagram_connections").select("*").eq("user_id", conn.user_id).maybeSingle(),
    supabase.from("tiktok_connections").select("*").eq("user_id", conn.user_id).maybeSingle(),
  ]);

  let igSummaryData: IgSummaryData | null = null;
  if (igConn) {
    try {
      let pageToken = igConn.page_access_token;
      if (igConn.token_expires_at && new Date(igConn.token_expires_at) <= new Date()) {
        const refreshed = await refreshIgToken(igConn.user_access_token);
        if (refreshed) {
          pageToken = refreshed;
          await supabase.from("instagram_connections").update({
            page_access_token: pageToken,
            token_expires_at: new Date(Date.now() + 5184000 * 1000).toISOString(),
          }).eq("id", igConn.id);
        }
      }
      const posts = await fetchInstagramPosts(igConn.ig_user_id, pageToken);
      igSummaryData = buildIgSummaryData(posts, igConn.username ?? "", igConn.follower_count ?? 0);
    } catch { /* skip on error */ }
  }

  let ttSummaryData: TikTokSummaryData | null = null;
  if (ttConn) {
    try {
      let ttToken = ttConn.access_token;
      if (ttConn.token_expires_at && new Date(ttConn.token_expires_at) <= new Date()) {
        if (ttConn.refresh_token) {
          const refreshed = await refreshTikTokToken(ttConn.refresh_token);
          if (refreshed) {
            ttToken = refreshed.access_token;
            await supabase.from("tiktok_connections").update({
              access_token: ttToken,
              token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
              refresh_token: refreshed.refresh_token,
              refresh_token_expires_at: new Date(Date.now() + refreshed.refresh_expires_in * 1000).toISOString(),
            }).eq("id", ttConn.id);
          }
        }
      }
      const videos = await fetchTikTokVideos(ttToken);
      ttSummaryData = buildTikTokSummaryData(videos, ttConn.display_name ?? "", ttConn.follower_count ?? 0, ttConn.video_count ?? 0);
    } catch { /* skip on error */ }
  }

  const scored = scoreVideos(rawVideos as Record<string, unknown>[], analyticsMap);
  const commentTargetIds = [
    ...scored.sorted.slice(0, 10),
    ...scored.sorted.slice(-10).reverse(),
  ].map((v) => v.id);
  const commentsMap = await fetchComments(commentTargetIds, accessToken);

  const attach = (v: ReturnType<typeof scoreVideos>["sorted"][0]) => ({
    ...v,
    topComments: commentsMap.get(v.id) ?? [],
  });

  const channel = {
    id: conn.channel_id,
    title: conn.channel_title,
    handle: conn.channel_handle ?? "",
    thumbnail: conn.channel_thumbnail ?? "",
    subscriberCount: channelInfo.subscriberCount,
    totalViews: channelInfo.totalViews,
    videoCount: videoIds.length,
  };

  const summary = {
    channel,
    averages: scored.averages,
    topPerformers: scored.sorted.slice(0, 10).map(attach),
    bottomPerformers: scored.sorted.slice(-10).reverse().map(attach),
    outliers: scored.outliers,
    totalVideosAnalysed: scored.sorted.length,
    dateRange: scored.dateRange,
  };

  const prompt = buildPrompt(
    summary as unknown as Record<string, unknown>,
    nicheSummary as unknown as Record<string, unknown> | null,
    igSummaryData,
    ttSummaryData
  );
  const { brief, autopsy } = await callClaude(prompt);

  const { data: analysis } = await supabase.from("analyses").insert({
    user_id: conn.user_id,
    channel_id: conn.channel_id,
    raw_videos: rawVideos,
    summary,
    brief,
    autopsy,
    total_videos: videoIds.length,
    instagram_summary: igSummaryData,
    tiktok_summary: ttSummaryData,
    is_unread: true,
    generated_by: "scheduled",
  }).select("id").single();

  if (analysis) {
    const prevDate = prevSnapshot?.created_at ? new Date(prevSnapshot.created_at) : new Date(0);
    const newTitles = (rawVideos as Record<string, unknown>[])
      .filter((v) => new Date(String((v.snippet as Record<string, unknown>)?.publishedAt ?? "")) > prevDate)
      .map((v) => String((v.snippet as Record<string, unknown>)?.title ?? ""));

    const { followed, matchTitle, matchScore } = detectBriefCompliance(newTitles, prevAnalysis?.brief as Record<string, unknown> | null);
    const top = scored.sorted[0];
    const contentBreakdown = buildContentBreakdown(scored.sorted.slice(0, 10), scored.sorted.slice(-10).reverse());

    await supabase.from("channel_snapshots").insert({
      user_id: conn.user_id,
      channel_id: conn.channel_id,
      analysis_id: analysis.id,
      subscriber_count: channelInfo.subscriberCount,
      avg_ctr: scored.averages.ctr,
      avg_retention: scored.averages.retentionRate,
      avg_views_per_video: scored.averages.views,
      total_videos_analysed: scored.sorted.length,
      top_video_id: top?.id ?? null,
      top_video_title: top?.title ?? null,
      top_video_views: top?.viewCount ?? null,
      top_video_score: top?.performanceScore ?? null,
      top_video_published_at: top?.publishedAt ?? null,
      new_videos_count: newTitles.length,
      brief_followed: prevAnalysis ? followed : null,
      brief_match_video_title: matchTitle,
      brief_match_score: prevAnalysis ? matchScore : null,
      content_breakdown: contentBreakdown,
    });
  }
}

Deno.serve(async (req) => {
  if (req.headers.get("Authorization") !== `Bearer ${CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: connections } = await supabase
    .from("youtube_connections")
    .select("*, users!inner(niche)")
    .not("refresh_token", "is", null);

  const results: { userId: string; status: string; error?: string }[] = [];
  const START = Date.now();

  for (const conn of connections ?? []) {
    if (Date.now() - START > 120_000) {
      results.push({ userId: conn.user_id, status: "skipped", error: "time limit" });
      continue;
    }
    try {
      await processCreator(conn, supabase);
      results.push({ userId: conn.user_id, status: "ok" });
    } catch (err) {
      results.push({ userId: conn.user_id, status: "error", error: err instanceof Error ? err.message : String(err) });
    }
  }

  return Response.json({ processed: results.length, results });
});
