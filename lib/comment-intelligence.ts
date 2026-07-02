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
      out.push({ platform: "youtube", videoTitle: v.title, tier: "top", text: text.slice(0, 150) });
    }
  }
  for (const v of summary.bottomPerformers) {
    for (const text of v.topComments ?? []) {
      out.push({ platform: "youtube", videoTitle: v.title, tier: "bottom", text: text.slice(0, 150) });
    }
  }

  if (tikTokSummary) {
    for (const v of tikTokSummary.topVideos) {
      const title = v.title || v.video_description.slice(0, 60) || "Untitled";
      for (const text of v.top_comments ?? []) {
        out.push({ platform: "tiktok", videoTitle: title, tier: "top", text: text.slice(0, 150) });
      }
    }
  }

  if (igSummary) {
    for (const p of igSummary.topPosts.slice(0, 5)) {
      const title = p.caption?.slice(0, 60) || p.media_type;
      for (const text of p.topComments ?? []) {
        out.push({ platform: "instagram", videoTitle: title, tier: "top", text: text.slice(0, 150) });
      }
    }
  }

  return out.slice(0, 200);
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
  const t0 = Date.now();
  console.log("[comment-intel] Starting comment collection");
  console.log("[comment-intel] Input: topPerformers=%d bottomPerformers=%d tiktok=%s instagram=%s",
    summary.topPerformers.length, summary.bottomPerformers.length,
    tikTokSummary ? `yes(${tikTokSummary.topVideos.length} videos)` : "no",
    igSummary ? `yes(${igSummary.topPosts.length} posts)` : "no"
  );

  const ytTopCount = summary.topPerformers.reduce((n, v) => n + (v.topComments?.length ?? 0), 0);
  const ytBotCount = summary.bottomPerformers.reduce((n, v) => n + (v.topComments?.length ?? 0), 0);
  const ttCount = tikTokSummary?.topVideos.reduce((n, v) => n + (v.top_comments?.length ?? 0), 0) ?? 0;
  const igCount = igSummary?.topPosts.slice(0, 5).reduce((n, p) => n + (p.topComments?.length ?? 0), 0) ?? 0;
  console.log("[comment-intel] Comments available: yt-top=%d yt-bottom=%d tiktok=%d instagram=%d",
    ytTopCount, ytBotCount, ttCount, igCount);

  const comments = collectComments(summary, tikTokSummary, igSummary);
  const topCommenters = (summary.topCommenters ?? []).map((c) => ({ author: c.author, commentCount: c.count }));
  console.log("[comment-intel] Collected %d comments after cap (topCommenters=%d)", comments.length, topCommenters.length);

  if (comments.length < 10) {
    console.log("[comment-intel] Too few comments (%d < 10), returning empty intelligence", comments.length);
    return emptyIntelligence(comments.length);
  }

  const prompt = buildPrompt(comments);
  console.log("[comment-intel] Prompt built: %d chars, %d comment groups", prompt.length, comments.length);

  let message: Awaited<ReturnType<typeof client.messages.create>>;
  try {
    console.log("[comment-intel] Calling Anthropic API...");
    message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: "You are an expert audience intelligence analyst. Return only valid JSON.",
      messages: [{ role: "user", content: prompt }],
    });
    console.log("[comment-intel] API response received in %dms | stop_reason=%s | input_tokens=%d output_tokens=%d",
      Date.now() - t0, message.stop_reason, message.usage.input_tokens, message.usage.output_tokens);
  } catch (err) {
    console.error("[comment-intel] Anthropic API call FAILED after %dms: %s",
      Date.now() - t0, err instanceof Error ? err.message : String(err));
    if (err instanceof Error && err.stack) console.error("[comment-intel] Stack:", err.stack);
    return { ...emptyIntelligence(comments.length), topCommenters };
  }

  if (message.stop_reason === "max_tokens") {
    console.error("[comment-intel] TRUNCATED — hit max_tokens limit. input_tokens=%d output_tokens=%d comments=%d prompt_chars=%d",
      message.usage.input_tokens, message.usage.output_tokens, comments.length, prompt.length);
    return { ...emptyIntelligence(comments.length), topCommenters };
  }

  const raw = message.content[0].type === "text" ? message.content[0].text : "";
  const text = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  console.log("[comment-intel] Raw response: %d chars, starts with: %s", raw.length, raw.slice(0, 60).replace(/\n/g, "\\n"));

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
    console.log("[comment-intel] JSON parsed OK. Keys: %s", Object.keys(parsed).join(", "));
    console.log("[comment-intel] themes=%d videoIdeas=%d audiencePersonas=%d keyInsight=%s",
      Array.isArray(parsed.themes) ? parsed.themes.length : "missing",
      Array.isArray(parsed.videoIdeas) ? parsed.videoIdeas.length : "missing",
      Array.isArray(parsed.audiencePersonas) ? parsed.audiencePersonas.length : "missing",
      typeof parsed.keyInsight === "string" ? "present" : "missing"
    );
  } catch (err) {
    console.error("[comment-intel] JSON.parse FAILED: %s", err instanceof Error ? err.message : String(err));
    console.error("[comment-intel] Text before parse (first 800):\n%s", text.slice(0, 800));
    console.error("[comment-intel] Text before parse (last 200):\n%s", text.slice(-200));
    return { ...emptyIntelligence(comments.length), topCommenters };
  }

  console.log("[comment-intel] Done in %dms", Date.now() - t0);
  return {
    totalCommentsAnalysed: comments.length,
    themes: parsed.themes as CommentIntelligence["themes"] ?? [],
    videoIdeas: parsed.videoIdeas as CommentIntelligence["videoIdeas"] ?? [],
    emotionalSignals: parsed.emotionalSignals as CommentIntelligence["emotionalSignals"] ?? { excited: 0, grateful: 0, curious: 0, confused: 0, critical: 0, requesting: 0 },
    sentimentBreakdown: parsed.sentimentBreakdown as CommentIntelligence["sentimentBreakdown"] ?? { positive: 0, neutral: 0, negative: 0 },
    audiencePersonas: parsed.audiencePersonas as CommentIntelligence["audiencePersonas"] ?? [],
    topCommenters,
    keyInsight: typeof parsed.keyInsight === "string" ? parsed.keyInsight : "",
    generatedAt: new Date().toISOString(),
  };
}
