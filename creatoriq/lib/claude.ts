import Anthropic from "@anthropic-ai/sdk";
import type { ChannelSummary, ContentBrief, ContentAutopsy, VideoWithScore, NicheSummary, InstagramSummary, TikTokSummary } from "@/types";

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

function buildInstagramSection(ig: InstagramSummary): string {
  const topPosts = ig.topPosts.slice(0, 10);
  return `
INSTAGRAM INTELLIGENCE (@${ig.username})
=========================================
Followers: ${fmt(ig.followerCount)} | Total posts: ${ig.mediaCount} | Posts analysed: ${ig.posts.length}

INSTAGRAM AVERAGES
Avg likes: ${fmt(ig.averages.likes)} | Avg comments: ${fmt(ig.averages.comments)} | Engagement rate: ${ig.averages.engagementRate}%
Avg reach: ${fmt(ig.averages.reach)} | Avg engagement actions: ${fmt(ig.averages.engagement)}

CONTENT TYPE BREAKDOWN
${ig.contentTypeBreakdown.map((t) => `${t.type}: ${t.count} posts, avg engagement ${fmt(t.avgEngagement)}`).join("\n")}

TOP 10 INSTAGRAM POSTS BY ENGAGEMENT
${topPosts.map((p, i) => `${i + 1}. [${p.media_type}] ${p.caption?.slice(0, 120) || "(no caption)"}
   Likes: ${fmt(p.like_count)} | Comments: ${p.comments_count} | Reach: ${fmt(p.reach)} | Saved: ${fmt(p.saved)} | Posted: ${p.timestamp.slice(0, 10)}`).join("\n\n")}`;
}

function buildTikTokSection(tt: TikTokSummary): string {
  const topVideos = tt.topVideos.slice(0, 10);
  return `
TIKTOK INTELLIGENCE (@${tt.displayName})
=========================================
Followers: ${fmt(tt.followerCount)} | Following: ${fmt(tt.followingCount)} | Total likes: ${fmt(tt.likesCount)} | Videos analysed: ${tt.videos.length}

TIKTOK AVERAGES
Avg views: ${fmt(tt.averages.views)} | Avg likes: ${fmt(tt.averages.likes)} | Avg comments: ${fmt(tt.averages.comments)} | Avg shares: ${fmt(tt.averages.shares)}
Engagement rate: ${tt.averages.engagementRate}%

TOP 10 TIKTOK VIDEOS BY VIEWS
${topVideos.map((v, i) => {
    const comments = v.top_comments?.slice(0, 3).map((c) => `"${c.slice(0, 100)}"`).join(" | ") ?? "none";
    const date = new Date(v.create_time * 1000).toISOString().slice(0, 10);
    return `${i + 1}. "${v.title || v.video_description.slice(0, 80) || "(untitled)"}"
   Views: ${fmt(v.view_count)} | Likes: ${fmt(v.like_count)} | Comments: ${v.comment_count} | Shares: ${fmt(v.share_count)} | Duration: ${v.duration}s | Posted: ${date}
   Top comments: ${comments}`;
  }).join("\n\n")}`;
}

const SYSTEM = `You are an expert YouTube content strategist. You receive a creator's full channel intelligence report plus optional niche, Instagram, and TikTok data.

Every recommendation in the brief MUST be tied to a specific data point from the channel or niche data (e.g. "your top 3 videos all had CTR above 8%", "niche median retention is 42%", "your #1 video got 3.2× your average views"). Generic advice is not acceptable.

Return ONLY a single valid JSON object — no markdown, no explanation:

{
  "brief": {
    "weeklyIdea": "Specific, concrete video concept (not vague) grounded in the intersection of what this channel's data shows works and what the niche data confirms is in demand",
    "titleOptions": [
      "Title option 1 — use the highest-CTR pattern from this creator's top performers",
      "Title option 2 — use the top-performing title format from the niche data",
      "Title option 3 — curiosity-gap or contrarian angle grounded in audience comment signals"
    ],
    "hook": {
      "openingLine": "The exact first sentence or action — make it punchy and specific, not generic",
      "setup": "Seconds 0–10: what you establish. The concrete premise or claim that makes the viewer want to stay.",
      "tension": "Seconds 10–20: the conflict, problem, or curiosity gap you introduce. Reference something the audience cares about based on comment data or niche topic clusters.",
      "payoff": "Seconds 20–30: the explicit payoff promise. What exact value will the viewer have if they watch to the end?"
    },
    "recommendedLength": "Specific duration (e.g. '8–12 minutes') with the data reason (e.g. 'your top 5 videos avg 9.4 min; niche top-quartile peaks at 10–14 min')",
    "format": "Production approach: structure, pacing, camera style, b-roll needs — grounded in retention data",
    "estimatedPerformance": "Honest projection vs channel average, citing the closest comparable video from their own history",
    "keyTalkingPoints": ["point 1 with why this angle resonates based on data", "point 2", "point 3", "point 4"],
    "thumbnail": {
      "concept": "Overall visual concept in one sentence — what the viewer sees at a glance",
      "colours": "Specific colour palette (e.g. 'high-contrast red and white on dark background — your top CTR videos all use this')",
      "composition": "Layout and framing notes (e.g. 'face takes left 60%, bold 2-word text right — mirrors your #1 CTR video')",
      "textOverlay": "Exact text to use on the thumbnail (2–5 words max)",
      "faceExpression": "If relevant: expression/pose direction tied to the emotional hook"
    },
    "dataEvidence": [
      { "claim": "Why this topic", "evidence": "Cite the specific metric, video title, or niche stat that justifies this — e.g. 'Your 3 highest-performing videos all covered X, averaging 2.8× channel average views'" },
      { "claim": "Why this length", "evidence": "Specific data — e.g. 'Your retention drops below 40% after 14 min; niche top quartile is 10–14 min'" },
      { "claim": "Why this thumbnail approach", "evidence": "Specific data — e.g. 'Your top-CTR video (8.4%) used this exact red/white contrast pattern'" },
      { "claim": "Why this hook structure", "evidence": "Specific data — e.g. 'Audience comments on your top videos frequently ask about X — this hook addresses that directly'" }
    ]
  },
  "autopsy": {
    "overallTrend": "One honest sentence on trajectory based on the data — cite actual numbers",
    "whatIsWorking": ["Specific data-backed finding with numbers", "finding 2", "finding 3", "finding 4"],
    "whatIsNotWorking": ["Specific data-backed finding with numbers", "finding 2", "finding 3"],
    "audienceInsights": "Who this audience is and what they demonstrably respond to — inferred from comments and performance patterns, cite specifics",
    "topPerformerPattern": "The precise shared pattern across this creator's top videos — format, topic, tone, length — with numbers",
    "bottomPerformerPattern": "The precise shared pattern across bottom videos — with numbers",
    "actionableAdvice": ["Specific action with clear rationale", "action 2", "action 3", "action 4"]
  }
}`;

export async function generateContentBrief(
  summary: ChannelSummary,
  nicheSummary: NicheSummary | null,
  igSummary: InstagramSummary | null = null,
  tikTokSummary: TikTokSummary | null = null
): Promise<{ brief: ContentBrief; autopsy: ContentAutopsy }> {
  const prompt = [
    buildChannelSection(summary),
    nicheSummary ? buildNicheSection(nicheSummary) : "",
    igSummary ? buildInstagramSection(igSummary) : "",
    tikTokSummary ? buildTikTokSection(tikTokSummary) : "",
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

  const brief: ContentBrief = {
    weeklyIdea: parsed.brief.weeklyIdea ?? "",
    titleOptions: (parsed.brief.titleOptions ?? []).slice(0, 3),
    hook: parsed.brief.hook ?? "",
    recommendedLength: parsed.brief.recommendedLength ?? "",
    format: parsed.brief.format ?? "",
    estimatedPerformance: parsed.brief.estimatedPerformance ?? "",
    keyTalkingPoints: parsed.brief.keyTalkingPoints ?? [],
    thumbnail: parsed.brief.thumbnail ?? parsed.brief.thumbnailDirection ?? "",
    dataEvidence: parsed.brief.dataEvidence ?? [],
  };

  return { brief, autopsy: parsed.autopsy };
}
