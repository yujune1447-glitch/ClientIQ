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

  const withCtr = videos.filter((v) => (v.ctr ?? 0) > 0);
  const withRetention = videos.filter((v) => (v.averageViewPercentage ?? 0) > 0);
  const avgCtr = withCtr.length ? withCtr.reduce((s, v) => s + (v.ctr ?? 0), 0) / withCtr.length : 0;
  const avgRetention = withRetention.length
    ? withRetention.reduce((s, v) => s + (v.averageViewPercentage ?? 0), 0) / withRetention.length
    : 0;

  for (const v of videos) {
    const viewScore = avgViews > 0 ? v.viewCount / avgViews : 0;
    const ctrScore = avgCtr > 0 ? (v.ctr ?? 0) / avgCtr : 0;
    const retentionScore = avgRetention > 0 ? (v.averageViewPercentage ?? 0) / avgRetention : 0;
    v.performanceScore = Math.round((viewScore * 0.5 + ctrScore * 0.3 + retentionScore * 0.2) * 10) / 10;
    v.viewsVsAverage = avgViews > 0 ? Math.round((v.viewCount / avgViews - 1) * 100) : 0;
  }

  const sorted = [...videos].sort((a, b) => b.performanceScore - a.performanceScore);

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
      ctr: Math.round(avgCtr * 100) / 100,
      retentionRate: Math.round(avgRetention * 100) / 100,
    },
    outliers,
    dateRange: { from: dates[0], to: dates[dates.length - 1] },
  };
}

export function buildSummary(
  result: ScoredResult,
  commentsMap: Map<string, string[]>,
  channel: YouTubeChannel
): ChannelSummary {
  const { scored, averages, outliers, dateRange } = result;

  const attach = (v: VideoWithScore) => ({ ...v, topComments: commentsMap.get(v.id) ?? [] });

  return {
    channel,
    averages,
    topPerformers: scored.slice(0, 10).map(attach),
    bottomPerformers: scored.slice(-10).reverse().map(attach),
    outliers,
    totalVideosAnalysed: scored.length,
    dateRange,
  };
}
