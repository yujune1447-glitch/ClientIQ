import { createAdminClient } from "@/lib/supabase-admin";
import type { ChannelSummary, ContentBrief, RawVideo, ContentFormatStat } from "@/types";

const STOP = new Set([
  "the","a","an","and","or","but","in","on","at","to","for","of","with","by",
  "from","is","are","was","were","be","been","have","has","had","do","does",
  "did","will","would","could","should","that","this","these","those","you",
  "your","they","them","their","what","how","why","when","who","which","just",
  "get","more","can","not","all","one","about","up","out","so","my","me","it",
]);

function tokens(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(
    (w) => w.length > 3 && !STOP.has(w)
  );
}

function briefKeywords(brief: ContentBrief): Set<string> {
  const words = [
    ...tokens(brief.weeklyIdea),
    ...brief.titleOptions.flatMap(tokens),
    ...brief.keyTalkingPoints.flatMap(tokens),
  ];
  return new Set(words);
}

function detectBriefCompliance(
  newVideos: { title: string }[],
  prevBrief: ContentBrief | null
): { followed: boolean; matchTitle: string | null; matchScore: number } {
  if (!prevBrief || !newVideos.length) {
    return { followed: false, matchTitle: null, matchScore: 0 };
  }
  const keywords = briefKeywords(prevBrief);
  let bestTitle: string | null = null;
  let bestScore = 0;
  for (const v of newVideos) {
    const words = tokens(v.title);
    const overlap = words.filter((w) => keywords.has(w)).length;
    const score = overlap / Math.max(words.length, 1);
    if (score > bestScore) {
      bestScore = score;
      bestTitle = v.title;
    }
  }
  return {
    followed: bestScore >= 0.25,
    matchTitle: bestTitle,
    matchScore: Math.round(bestScore * 100),
  };
}

function detectFormat(title: string): string {
  if (/^\d+\s|\b\d+\s+(ways|tips|things|steps|reasons|secrets|mistakes|rules)\b/i.test(title)) return "Number list";
  if (/^how to/i.test(title)) return "How-to";
  if (/^why\s/i.test(title)) return "Why-format";
  if (/\b(i |my |i've |i'm )/i.test(title)) return "Personal story";
  if (/\?$/.test(title)) return "Question";
  return "Other";
}

function buildContentBreakdown(
  topPerformers: ChannelSummary["topPerformers"],
  bottomPerformers: ChannelSummary["bottomPerformers"]
): ContentFormatStat[] {
  const buckets: Record<string, { count: number; totalScore: number; totalViews: number }> = {};
  for (const v of [...topPerformers, ...bottomPerformers]) {
    const fmt = detectFormat(v.title);
    if (!buckets[fmt]) buckets[fmt] = { count: 0, totalScore: 0, totalViews: 0 };
    buckets[fmt].count++;
    buckets[fmt].totalScore += v.performanceScore;
    buckets[fmt].totalViews += v.viewCount;
  }
  return Object.entries(buckets)
    .map(([format, { count, totalScore, totalViews }]) => ({
      format,
      count,
      avgScore: Math.round((totalScore / count) * 10) / 10,
      avgViews: Math.round(totalViews / count),
    }))
    .sort((a, b) => b.avgScore - a.avgScore);
}

export async function saveSnapshot(params: {
  userId: string;
  channelId: string;
  analysisId: string;
  summary: ChannelSummary;
  rawVideos: RawVideo[];
}): Promise<void> {
  const { userId, channelId, analysisId, summary, rawVideos } = params;
  const supabase = createAdminClient();

  const [{ data: prevSnapshot }, { data: prevAnalysis }] = await Promise.all([
    supabase
      .from("channel_snapshots")
      .select("created_at")
      .eq("user_id", userId)
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("analyses")
      .select("brief, created_at")
      .eq("user_id", userId)
      .eq("channel_id", channelId)
      .neq("id", analysisId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const prevDate = prevSnapshot?.created_at ? new Date(prevSnapshot.created_at) : new Date(0);
  const newVideoTitles = rawVideos
    .filter((v) => new Date(v.snippet.publishedAt) > prevDate)
    .map((v) => ({ title: v.snippet.title }));

  const { followed, matchTitle, matchScore } = detectBriefCompliance(
    newVideoTitles,
    (prevAnalysis?.brief as ContentBrief) ?? null
  );

  const top = summary.topPerformers[0] ?? null;
  const contentBreakdown = buildContentBreakdown(summary.topPerformers, summary.bottomPerformers);

  await supabase.from("channel_snapshots").insert({
    user_id: userId,
    channel_id: channelId,
    analysis_id: analysisId,
    subscriber_count: summary.channel.subscriberCount,
    avg_ctr: summary.averages.ctr,
    avg_retention: summary.averages.retentionRate,
    avg_views_per_video: summary.averages.views,
    total_videos_analysed: summary.totalVideosAnalysed,
    top_video_id: top?.id ?? null,
    top_video_title: top?.title ?? null,
    top_video_views: top?.viewCount ?? null,
    top_video_score: top?.performanceScore ?? null,
    top_video_published_at: top?.publishedAt ?? null,
    new_videos_count: newVideoTitles.length,
    brief_followed: prevAnalysis ? followed : null,
    brief_match_video_title: matchTitle,
    brief_match_score: prevAnalysis ? matchScore : null,
    content_breakdown: contentBreakdown,
  });
}
