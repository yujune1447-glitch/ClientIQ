import Anthropic from "@anthropic-ai/sdk";
import type { ChannelSummary, ContentBrief, ContentAutopsy, VideoWithScore, NicheSummary } from "@/types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

function formatVideo(v: VideoWithScore, i: number) {
  const comments = v.topComments?.slice(0, 5).map((c) => `"${c.slice(0, 120)}"`).join(" | ") ?? "none";
  return `${i + 1}. "${v.title}"
   Views: ${fmt(v.viewCount)} (${v.viewsVsAverage > 0 ? "+" : ""}${v.viewsVsAverage}% vs avg) | Score: ${v.performanceScore}
   CTR: ${v.ctr?.toFixed(2) ?? "N/A"}% | Retention: ${v.averageViewPercentage?.toFixed(1) ?? "N/A"}% | Published: ${v.publishedAt.slice(0, 10)}
   Top comments: ${comments}`;
}

function buildChannelSection(summary: ChannelSummary): string {
  const { channel, averages, topPerformers, bottomPerformers, outliers, totalVideosAnalysed, dateRange } = summary;
  return `CHANNEL INTELLIGENCE REPORT
===========================
Channel: ${channel.title}${channel.handle ? ` (@${channel.handle})` : ""}
Subscribers: ${fmt(channel.subscriberCount)}
Total videos analysed: ${totalVideosAnalysed}
Date range: ${dateRange.from.slice(0, 10)} → ${dateRange.to.slice(0, 10)}

CHANNEL AVERAGES
Views/video: ${fmt(averages.views)} | Likes/video: ${fmt(averages.likes)} | Comments/video: ${fmt(averages.comments)}
CTR: ${averages.ctr}% | Retention: ${averages.retentionRate}%

TOP 10 PERFORMING VIDEOS
${topPerformers.map(formatVideo).join("\n\n")}

BOTTOM 10 PERFORMING VIDEOS
${bottomPerformers.map(formatVideo).join("\n\n")}

OUTLIER VIDEOS (>2 std deviations above average)
${outliers.length ? outliers.map(formatVideo).join("\n\n") : "None identified"}`;
}

function buildNicheSection(niche: NicheSummary): string {
  return `
NICHE INTELLIGENCE: "${niche.niche}"
=====================================
Public videos analysed in this niche: ${niche.videosAnalysed}

VIEW BENCHMARKS IN THIS NICHE
Median: ${fmt(niche.viewBenchmarks.median)} | Top quartile: ${fmt(niche.viewBenchmarks.topQuartile)} | Viral threshold: ${fmt(niche.viewBenchmarks.viral)}

TITLE PATTERNS (what works in this niche)
Common formats: ${niche.titlePatterns.commonFormats.join("; ") || "No dominant format"}
Power words: ${niche.titlePatterns.powerWords.join(", ")}
Avg title length: ${niche.titlePatterns.avgTitleLength} characters

TOP 5 PERFORMING TITLES IN NICHE
${niche.titlePatterns.topTitles.map((t, i) => `${i + 1}. "${t}"`).join("\n")}

OPTIMAL VIDEO LENGTH
${niche.lengthInsights.recommendation}
Median: ${fmtSecs(niche.lengthInsights.medianDurationSeconds)} | Top quartile range: ${fmtSecs(niche.lengthInsights.topPerformerRangeSeconds[0])}–${fmtSecs(niche.lengthInsights.topPerformerRangeSeconds[1])}

HOOK PATTERNS IN TOP NICHE VIDEOS
${niche.hookPatterns.length ? niche.hookPatterns.join("\n") : "No dominant hook pattern identified"}

DOMINANT TOPICS IN THIS NICHE
${niche.topicClusters.join(", ")}

TOP 10 NICHE VIDEOS (for context)
${niche.topPerformers.map((v, i) => `${i + 1}. "${v.title}" — ${fmt(v.views)} views, ${fmtSecs(v.durationSeconds)}`).join("\n")}`;
}

const SYSTEM = `You are an expert YouTube content strategist. You will receive a creator's channel intelligence report${" "}and optionally niche intelligence data from the top performing public videos in their space.

Use BOTH data sources to generate recommendations. The niche data tells you what's working broadly in the space; the channel data tells you what works specifically for this creator and their audience. Find the intersection — where the creator's strengths meet proven niche patterns.

Return a single JSON object with this exact structure — no markdown, no explanation, only valid JSON:

{
  "brief": {
    "weeklyIdea": "specific video concept grounded in both channel performance and niche intelligence",
    "rationale": "data-backed explanation referencing specific top performers, niche patterns, and the gap or opportunity identified",
    "hook": "exact opening line or scene for the video",
    "format": "recommended format, length, and production approach — reference both what this audience retains AND what length works in the niche",
    "estimatedPerformance": "honest prediction relative to channel average, with reference to niche benchmarks",
    "keyTalkingPoints": ["point 1", "point 2", "point 3", "point 4"],
    "thumbnailDirection": "specific creative direction referencing CTR patterns in the creator's data and title patterns from the niche",
    "titleOptions": ["title 1", "title 2", "title 3"]
  },
  "autopsy": {
    "overallTrend": "one honest sentence on the channel's trajectory based on the data",
    "whatIsWorking": ["specific data-backed finding", "finding 2", "finding 3", "finding 4"],
    "whatIsNotWorking": ["specific data-backed finding", "finding 2", "finding 3"],
    "audienceInsights": "who this audience is and what they demonstrably respond to, inferred from comments and performance patterns",
    "topPerformerPattern": "the precise pattern shared by the creator's top videos — format, topic, tone, length",
    "bottomPerformerPattern": "the precise pattern shared by the creator's bottom videos",
    "actionableAdvice": ["specific action 1", "action 2", "action 3", "action 4"]
  }
}`;

export async function generateContentBrief(
  summary: ChannelSummary,
  nicheSummary: NicheSummary | null
): Promise<{ brief: ContentBrief; autopsy: ContentAutopsy }> {
  const prompt = [
    buildChannelSection(summary),
    nicheSummary ? buildNicheSection(nicheSummary) : "",
  ].join("\n");

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = message.content[0].type === "text" ? message.content[0].text : "";
  const text = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const parsed = JSON.parse(text);
  return { brief: parsed.brief, autopsy: parsed.autopsy };
}
