import type { RawVideo, VideoAnalytics, VideoWithScore, ChannelSummary, YouTubeChannel } from "@/types";

interface ScoredResult {
  scored: VideoWithScore[];
  averages: ChannelSummary["averages"];
  outliers: VideoWithScore[];
  dateRange: { from: string; to: string };
}

export function scoreVideos(
  rawVideos: RawVideo[],
  analyticsMap: Map<string, VideoAnalytics>
): ScoredResult {
  const videos: VideoWithScore[] = rawVideos.map((raw) => {
    const a = analyticsMap.get(raw.id);
    return {
      id: raw.id,
      title: raw.snippet.title,
      publishedAt: raw.snippet.publishedAt,
      thumbnail: raw.snippet.thumbnails.medium?.url ?? raw.snippet.thumbnails.default?.url ?? "",
      viewCount: parseInt(raw.statistics.viewCount ?? "0"),
      likeCount: parseInt(raw.statistics.likeCount ?? "0"),
      commentCount: parseInt(raw.statistics.commentCount ?? "0"),
      duration: raw.contentDetails.duration,
      ctr: a?.ctr ?? 0,
      averageViewDuration: a?.averageViewDuration ?? 0,
      averageViewPercentage: a?.averageViewPercentage ?? 0,
      impressions: a?.impressions ?? 0,
      performanceScore: 0,
      viewsVsAverage: 0,
    };
  });

  const n = videos.length;

  const avgViews = videos.reduce((s, v) => s + v.viewCount, 0) / n;
  const avgLikes = videos.reduce((s, v) => s + v.likeCount, 0) / n;
  const avgComments = videos.reduce((s, v) => s + v.commentCount, 0) / n;

  const withRetention = videos.filter((v) => (v.averageViewPercentage ?? 0) > 0);
  const avgRetention = withRetention.length
    ? withRetention.reduce((s, v) => s + (v.averageViewPercentage ?? 0), 0) / withRetention.length
    : 0;

  for (const v of videos) {
    v.viewsVsAverage = avgViews > 0 ? Math.round((v.viewCount / avgViews - 1) * 100) : 0;
  }

  const sorted = [...videos].sort((a, b) => b.viewCount - a.viewCount);

  const variance = videos.reduce((s, v) => s + Math.pow(v.viewCount - avgViews, 2), 0) / n;
  const stdDev = Math.sqrt(variance);
  const outliers = videos
    .filter((v) => v.viewCount > avgViews + 2 * stdDev)
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, 5);

  const dates = videos.map((v) => v.publishedAt).sort();

  return {
    scored: sorted,
    averages: {
      views: Math.round(avgViews),
      likes: Math.round(avgLikes),
      comments: Math.round(avgComments),
      ctr: 0,
      retentionRate: Math.round(avgRetention * 100) / 100,
    },
    outliers,
    dateRange: { from: dates[0], to: dates[dates.length - 1] },
  };
}

export function buildSummary(
  result: ScoredResult,
  commentsMap: Map<string, { text: string; author: string }[]>,
  channel: YouTubeChannel
): ChannelSummary {
  const { scored, averages, outliers, dateRange } = result;

  const withComments = (v: VideoWithScore): VideoWithScore => {
    const comments = commentsMap.get(v.id) ?? [];
    return { ...v, topComments: comments.map((c) => c.text), topCommentAuthors: comments.map((c) => c.author) };
  };

  const authorCounts = new Map<string, number>();
  const attach = (v: VideoWithScore) => {
    const comments = commentsMap.get(v.id) ?? [];
    for (const c of comments) {
      if (c.author && c.author !== "Unknown") {
        authorCounts.set(c.author, (authorCounts.get(c.author) ?? 0) + 1);
      }
    }
    return { ...v, topComments: comments.map((c) => c.text), topCommentAuthors: comments.map((c) => c.author) };
  };

  const topPerformers = scored.slice(0, 10).map(attach);
  const bottomPerformers = scored.slice(-10).reverse().map(attach);

  const recentVideos = [...scored]
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, 60)
    .map(withComments);

  const topCommenters = Array.from(authorCounts.entries())
    .filter(([, count]) => count >= 2)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([author, count]) => ({ author, count }));

  return {
    channel,
    averages,
    topPerformers,
    bottomPerformers,
    outliers,
    recentVideos,
    totalVideosAnalysed: scored.length,
    dateRange,
    topCommenters: topCommenters.length > 0 ? topCommenters : undefined,
  };
}
