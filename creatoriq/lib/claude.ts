import Anthropic from "@anthropic-ai/sdk";
import type { ChannelSummary, ContentBrief, ContentAutopsy, VideoWithScore } from "@/types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatVideo(v: VideoWithScore, i: number) {
  const comments = v.topComments?.slice(0, 5).map((c) => `"${c.slice(0, 120)}"`).join(" | ") ?? "none";
  return `${i + 1}. "${v.title}"
   Views: ${fmt(v.viewCount)} (${v.viewsVsAverage > 0 ? "+" : ""}${v.viewsVsAverage}% vs avg) | Score: ${v.performanceScore}
   CTR: ${v.ctr?.toFixed(2) ?? "N/A"}% | Retention: ${v.averageViewPercentage?.toFixed(1) ?? "N/A"}% | Published: ${v.publishedAt.slice(0, 10)}
   Top comments: ${comments}`;
}

function buildPrompt(summary: ChannelSummary): string {
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

OUTLIER VIDEOS (>2 std deviations above average views)
${outliers.length ? outliers.map(formatVideo).join("\n\n") : "None identified"}`;
}

const SYSTEM = `You are an expert YouTube content strategist. Analyse the channel intelligence report and return a single JSON object with this exact structure — no markdown, no explanation, only valid JSON:

{
  "brief": {
    "weeklyIdea": "specific video concept grounded in the data",
    "rationale": "data-backed explanation referencing specific top performers and patterns",
    "hook": "exact opening line or scene for the video",
    "format": "recommended format, length, and production approach based on what retains this audience",
    "estimatedPerformance": "honest prediction relative to channel average with reasoning",
    "keyTalkingPoints": ["point 1", "point 2", "point 3", "point 4"],
    "thumbnailDirection": "specific creative direction referencing CTR patterns in the data",
    "titleOptions": ["title 1", "title 2", "title 3"]
  },
  "autopsy": {
    "overallTrend": "one honest sentence on the channel's trajectory based on the data",
    "whatIsWorking": ["specific data-backed finding", "finding 2", "finding 3", "finding 4"],
    "whatIsNotWorking": ["specific data-backed finding", "finding 2", "finding 3"],
    "audienceInsights": "who this audience is and what they demonstrably respond to, inferred from comments and performance data",
    "topPerformerPattern": "the precise pattern shared by top videos — format, topic, tone, length",
    "bottomPerformerPattern": "the precise pattern shared by bottom videos",
    "actionableAdvice": ["specific action 1", "action 2", "action 3", "action 4"]
  }
}`;

export async function generateContentBrief(summary: ChannelSummary): Promise<{
  brief: ContentBrief;
  autopsy: ContentAutopsy;
}> {
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: SYSTEM,
    messages: [{ role: "user", content: buildPrompt(summary) }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  const parsed = JSON.parse(text.trim());
  return { brief: parsed.brief, autopsy: parsed.autopsy };
}
