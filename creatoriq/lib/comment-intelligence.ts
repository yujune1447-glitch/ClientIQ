import Anthropic from "@anthropic-ai/sdk";
import type { ChannelSummary, TikTokSummary, InstagramSummary, CommentIntelligence } from "@/types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface FlatComment {
  platform: "youtube" | "tiktok" | "instagram";
  videoTitle: string;
  tier: "top" | "bottom";
  text: string;
}

function collectComments(
  summary: ChannelSummary,
  tikTokSummary: TikTokSummary | null,
  igSummary: InstagramSummary | null
): FlatComment[] {
  const out: FlatComment[] = [];

  for (const v of summary.topPerformers) {
    for (const text of v.topComments ?? []) {
      out.push({ platform: "youtube", videoTitle: v.title, tier: "top", text: text.slice(0, 200) });
    }
  }
  for (const v of summary.bottomPerformers) {
    for (const text of v.topComments ?? []) {
      out.push({ platform: "youtube", videoTitle: v.title, tier: "bottom", text: text.slice(0, 200) });
    }
  }

  if (tikTokSummary) {
    for (const v of tikTokSummary.topVideos) {
      const title = v.title || v.video_description.slice(0, 60) || "Untitled";
      for (const text of v.top_comments ?? []) {
        out.push({ platform: "tiktok", videoTitle: title, tier: "top", text: text.slice(0, 200) });
      }
    }
  }

  if (igSummary) {
    for (const p of igSummary.topPosts.slice(0, 5)) {
      const title = p.caption?.slice(0, 60) || p.media_type;
      for (const text of p.topComments ?? []) {
        out.push({ platform: "instagram", videoTitle: title, tier: "top", text: text.slice(0, 200) });
      }
    }
  }

  return out.slice(0, 300);
}

function buildPrompt(comments: FlatComment[]): string {
  const byVideo = new Map<string, FlatComment[]>();
  for (const c of comments) {
    const key = `[${c.platform.toUpperCase()}${c.tier === "top" ? " · top performer" : " · bottom performer"}] "${c.videoTitle.slice(0, 70)}"`;
    if (!byVideo.has(key)) byVideo.set(key, []);
    byVideo.get(key)!.push(c);
  }

  const body = Array.from(byVideo.entries())
    .map(([key, cs]) => `${key}\n${cs.map((c, i) => `  ${i + 1}. ${c.text}`).join("\n")}`)
    .join("\n\n");

  return `Analyse the following ${comments.length} audience comments from a content creator's videos. Extract deep intelligence.

${body}

Return ONLY a single JSON object — no markdown, no explanation:
{
  "themes": [
    {
      "name": "Short theme label (3-5 words)",
      "description": "What this comment cluster reveals and why it matters to the creator",
      "commentCount": <integer>,
      "exampleComments": ["verbatim quote 1", "verbatim quote 2", "verbatim quote 3"],
      "sentiment": "positive" | "mixed" | "negative"
    }
  ],
  "videoIdeas": [
    {
      "idea": "Specific actionable video title",
      "sourceComment": "The verbatim comment or question that inspired this",
      "estimatedDemand": "high" | "medium" | "low"
    }
  ],
  "emotionalSignals": {
    "excited": <0-100 % of comments>,
    "grateful": <0-100>,
    "curious": <0-100>,
    "confused": <0-100>,
    "critical": <0-100>,
    "requesting": <0-100>
  },
  "sentimentBreakdown": {
    "positive": <0-100>,
    "neutral": <0-100>,
    "negative": <0-100>
  },
  "audiencePersonas": [
    {
      "type": "Persona label (e.g. 'The Implementer')",
      "description": "Who they are, what they want, how they engage with the content",
      "cues": ["signal from comments", "signal 2", "signal 3"]
    }
  ],
  "keyInsight": "One sharp, specific, data-backed insight this creator needs to know about their audience right now"
}

Rules:
- themes: 4-8 clusters ordered by frequency, drawn only from what the comments actually show
- videoIdeas: 3-8 ideas directly supported by audience questions or recurring requests
- emotionalSignals: percentages are independent (a comment can show multiple emotions, total may exceed 100)
- sentimentBreakdown: positive + neutral + negative must sum to 100
- audiencePersonas: 2-4 distinct personas, grounded in comment evidence
- keyInsight: must be specific and actionable, not generic advice`;
}

function emptyIntelligence(count: number): CommentIntelligence {
  return {
    totalCommentsAnalysed: count,
    themes: [],
    videoIdeas: [],
    emotionalSignals: { excited: 0, grateful: 0, curious: 0, confused: 0, critical: 0, requesting: 0 },
    sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 },
    audiencePersonas: [],
    topCommenters: [],
    keyInsight: "Not enough comments collected to generate audience intelligence.",
    generatedAt: new Date().toISOString(),
  };
}

export async function analyzeComments(
  summary: ChannelSummary,
  tikTokSummary: TikTokSummary | null,
  igSummary: InstagramSummary | null
): Promise<CommentIntelligence> {
  const comments = collectComments(summary, tikTokSummary, igSummary);

  if (comments.length < 10) return emptyIntelligence(comments.length);

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: "You are an expert audience intelligence analyst. Return only valid JSON.",
    messages: [{ role: "user", content: buildPrompt(comments) }],
  });

  const raw = message.content[0].type === "text" ? message.content[0].text : "";
  const text = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const parsed = JSON.parse(text);

  const topCommenters = (summary.topCommenters ?? []).map((c) => ({
    author: c.author,
    commentCount: c.count,
  }));

  return {
    totalCommentsAnalysed: comments.length,
    themes: parsed.themes ?? [],
    videoIdeas: parsed.videoIdeas ?? [],
    emotionalSignals: parsed.emotionalSignals ?? { excited: 0, grateful: 0, curious: 0, confused: 0, critical: 0, requesting: 0 },
    sentimentBreakdown: parsed.sentimentBreakdown ?? { positive: 0, neutral: 0, negative: 0 },
    audiencePersonas: parsed.audiencePersonas ?? [],
    topCommenters,
    keyInsight: parsed.keyInsight ?? "",
    generatedAt: new Date().toISOString(),
  };
}
