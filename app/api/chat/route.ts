import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase-admin";
import { logUsage } from "@/lib/usage";
import type { ChannelSummary, ContentBrief, ContentAutopsy, CommentIntelligence } from "@/types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const CHAT_MODEL = "claude-sonnet-4-6";

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function buildContext(
  summary: ChannelSummary,
  brief: ContentBrief | null,
  autopsy: ContentAutopsy | null,
  commentIntel: CommentIntelligence | null
): string {
  const lines: string[] = [
    `CHANNEL: ${summary.channel.title}${summary.channel.handle ? ` (@${summary.channel.handle})` : ""}`,
    `Subscribers: ${fmt(summary.channel.subscriberCount)} | Videos analysed: ${summary.totalVideosAnalysed}`,
    `Avg views: ${fmt(summary.averages.views)} | Avg CTR: ${summary.averages.ctr}% | Avg retention: ${summary.averages.retentionRate}%`,
    `Date range: ${summary.dateRange.from.slice(0, 10)} → ${summary.dateRange.to.slice(0, 10)}`,
    "",
    "TOP PERFORMERS:",
    ...summary.topPerformers.slice(0, 5).map((v, i) =>
      `${i + 1}. "${v.title}" — ${fmt(v.viewCount)} views | Score ${v.performanceScore} | CTR ${v.ctr?.toFixed(2) ?? "N/A"}%`
    ),
    "",
    "BOTTOM PERFORMERS:",
    ...summary.bottomPerformers.slice(0, 5).map((v, i) =>
      `${i + 1}. "${v.title}" — ${fmt(v.viewCount)} views | Score ${v.performanceScore}`
    ),
  ];

  if (brief) {
    lines.push("", "LATEST CONTENT BRIEF:");
    lines.push(`Idea: ${brief.weeklyIdea}`);
    lines.push(`Title options: ${brief.titleOptions.join(" | ")}`);
    if (brief.keyTalkingPoints?.length) {
      lines.push(`Talking points: ${brief.keyTalkingPoints.join("; ")}`);
    }
  }

  if (autopsy) {
    lines.push("", "CHANNEL AUTOPSY:");
    lines.push(`Trend: ${autopsy.overallTrend}`);
    lines.push(`Working: ${autopsy.whatIsWorking.join("; ")}`);
    lines.push(`Not working: ${autopsy.whatIsNotWorking.join("; ")}`);
    lines.push(`Audience: ${autopsy.audienceInsights}`);
  }

  if (commentIntel && commentIntel.totalCommentsAnalysed > 0) {
    lines.push("", `COMMENT INTELLIGENCE (${commentIntel.totalCommentsAnalysed} comments):`);
    if (commentIntel.keyInsight) lines.push(`Key insight: ${commentIntel.keyInsight}`);
    if (commentIntel.themes.length) {
      lines.push(`Top themes: ${commentIntel.themes.slice(0, 3).map((t) => t.name).join(", ")}`);
    }
    if (commentIntel.videoIdeas.length) {
      lines.push("Video ideas from audience:");
      commentIntel.videoIdeas.slice(0, 3).forEach((idea) => {
        lines.push(`  · [${idea.estimatedDemand}] ${idea.idea}`);
      });
    }
  }

  return lines.join("\n");
}

type Platform = "youtube" | "tiktok" | "instagram";

function buildTikTokContext(conn: {
  display_name: string | null;
  follower_count: number | null;
  following_count: number | null;
  likes_count: number | null;
  video_count: number | null;
}): string {
  return [
    `TIKTOK ACCOUNT: ${conn.display_name ?? "TikTok"}`,
    `Followers: ${fmt(conn.follower_count ?? 0)} | Following: ${fmt(conn.following_count ?? 0)} | Total likes: ${fmt(conn.likes_count ?? 0)} | Videos: ${conn.video_count ?? 0}`,
  ].join("\n");
}

// Each platform gets its own isolated system prompt. The scoping instruction is
// explicit so the model never volunteers cross-platform context.
const SYSTEM_PROMPTS: Record<Platform, string> = {
  youtube:
    "You are an AI assistant built into CreatorIQ, a cross-platform content intelligence platform. You are currently scoped to the creator's YOUTUBE channel. Only discuss their YouTube data — never reference TikTok, Instagram, or any other platform. Be concise, specific, and data-driven. When answering, reference specific numbers and patterns from the creator's YouTube data.",
  tiktok:
    "You are an AI assistant built into CreatorIQ, a cross-platform content intelligence platform. You are currently scoped to the creator's TIKTOK account. Only discuss their TikTok data — never reference YouTube, Instagram, or any other platform, and never mention YouTube channel stats, video titles, or comment analysis. Be concise, specific, and data-driven. You currently have account-level stats only; deeper per-video analytics unlock once TikTok grants video-level API access — say so if asked for data you don't have.",
  instagram:
    "You are an AI assistant built into CreatorIQ, a cross-platform content intelligence platform. You are currently scoped to the creator's INSTAGRAM account, which is not yet connected (pending platform access). Only discuss Instagram in general terms — never reference YouTube, TikTok, or any other platform's data. Be concise and let the creator know Instagram data will be available once access is approved.",
};

export async function POST(request: NextRequest) {
  const userId = request.cookies.get("user_id")?.value;
  if (!userId) return new Response("Unauthorized", { status: 401 });

  let body: { messages: { role: string; content: string }[]; analysisId?: string; platform?: Platform };
  try {
    body = await request.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const { messages, analysisId } = body;
  const platform: Platform = body.platform ?? "youtube";
  if (!messages?.length) return new Response("Bad request", { status: 400 });

  const supabase = createAdminClient();

  let systemPrompt = SYSTEM_PROMPTS[platform];

  // Context injection is strictly per-platform: the TikTok thread never touches
  // the YouTube analyses table, and vice versa.
  if (platform === "youtube") {
    const query = analysisId
      ? supabase
          .from("analyses")
          .select("summary,brief,autopsy,comment_intelligence")
          .eq("id", analysisId)
          .eq("user_id", userId)
          .single()
      : supabase
          .from("analyses")
          .select("summary,brief,autopsy,comment_intelligence")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

    const { data: analysis } = await query;
    if (analysis?.summary) {
      const context = buildContext(
        analysis.summary as ChannelSummary,
        analysis.brief as ContentBrief | null,
        analysis.autopsy as ContentAutopsy | null,
        analysis.comment_intelligence as CommentIntelligence | null
      );
      systemPrompt += `\n\nHere is the creator's latest YouTube channel intelligence:\n\n${context}`;
    }
  } else if (platform === "tiktok") {
    const { data: conn } = await supabase
      .from("tiktok_connections")
      .select("display_name, follower_count, following_count, likes_count, video_count")
      .eq("user_id", userId)
      .maybeSingle();
    if (conn) {
      systemPrompt += `\n\nHere is the creator's TikTok account data:\n\n${buildTikTokContext(conn)}`;
    }
    // INTEGRATION POINT: when TIKTOK_VIDEO_ENABLED grants video.list scope, add
    // per-video TikTok analysis here (still TikTok-only — never the analyses table).
  }
  // instagram: no data source yet — system prompt alone.

  const stream = await client.messages.create({
    model: CHAT_MODEL,
    max_tokens: 1024,
    // The system prompt carries the platform grounding data, reused unchanged on
    // every turn of a conversation. cache_control makes those repeated tokens bill
    // at the cache-read rate. (Below the ~1024-token cache minimum — e.g. a bare
    // TikTok prompt — this is simply a no-op, never an error.)
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
    messages: messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    stream: true,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      // Accumulate token usage across streaming events for cost logging.
      const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
      try {
        for await (const event of stream) {
          if (event.type === "message_start") {
            const u = event.message.usage;
            usage.input_tokens = u.input_tokens ?? 0;
            usage.cache_read_input_tokens = u.cache_read_input_tokens ?? 0;
            usage.cache_creation_input_tokens = u.cache_creation_input_tokens ?? 0;
          } else if (event.type === "message_delta") {
            usage.output_tokens = event.usage.output_tokens ?? 0;
          } else if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } finally {
        logUsage(`chat:${platform}`, CHAT_MODEL, usage, userId);
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
