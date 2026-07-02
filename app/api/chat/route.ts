import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase-admin";
import type { ChannelSummary, ContentBrief, ContentAutopsy, CommentIntelligence } from "@/types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

export async function POST(request: NextRequest) {
  const userId = request.cookies.get("user_id")?.value;
  if (!userId) return new Response("Unauthorized", { status: 401 });

  let body: { messages: { role: string; content: string }[]; analysisId?: string };
  try {
    body = await request.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const { messages, analysisId } = body;
  if (!messages?.length) return new Response("Bad request", { status: 400 });

  const supabase = createAdminClient();
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

  let systemPrompt = `You are an AI assistant built into CreatorIQ, a content intelligence platform for YouTube creators. You help creators understand their channel data, plan content, and grow their audience. Be concise, specific, and data-driven. When answering, reference specific numbers and patterns from the creator's data.`;

  if (analysis?.summary) {
    const context = buildContext(
      analysis.summary as ChannelSummary,
      analysis.brief as ContentBrief | null,
      analysis.autopsy as ContentAutopsy | null,
      analysis.comment_intelligence as CommentIntelligence | null
    );
    systemPrompt += `\n\nHere is the creator's latest channel intelligence:\n\n${context}`;
  }

  const stream = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: systemPrompt,
    messages: messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    stream: true,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } finally {
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
