import Anthropic from "@anthropic-ai/sdk";
import { logUsage } from "@/lib/usage";
import { checkBriefGrounding } from "@/lib/brief-grounding";
import type { ChannelSummary, ContentBrief, BriefPrediction, ContentAutopsy, VideoWithScore, NicheSummary, InstagramSummary, TikTokSummary, CommentIntelligence, SuccessPatterns, ChannelSynthesis } from "@/types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-4-6";

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
  const comments = v.topComments?.slice(0, 3).map((c) => `"${c.slice(0, 80)}"`).join(" | ") ?? "none";
  return `${i + 1}. "${v.title.slice(0, 80)}"
   Views: ${fmt(v.viewCount)} (${v.viewsVsAverage > 0 ? "+" : ""}${v.viewsVsAverage}% vs avg) | Likes: ${fmt(v.likeCount)} | Comments: ${fmt(v.commentCount)} | Retention: ${v.averageViewPercentage?.toFixed(1) ?? "N/A"}%
   Comments: ${comments}`;
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
Retention: ${averages.retentionRate}%

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

function buildCommentIntelSection(intel: CommentIntelligence): string {
  const { themes, videoIdeas, emotionalSignals, sentimentBreakdown, audiencePersonas, topCommenters, keyInsight, totalCommentsAnalysed } = intel;
  const lines: string[] = [`\nAUDIENCE COMMENT INTELLIGENCE (${totalCommentsAnalysed} comments analysed)\n${"=".repeat(60)}`];
  if (keyInsight) lines.push(`\nKEY AUDIENCE INSIGHT\n${keyInsight}`);
  lines.push(`\nSENTIMENT BREAKDOWN\nPositive: ${sentimentBreakdown.positive}% | Neutral: ${sentimentBreakdown.neutral}% | Negative: ${sentimentBreakdown.negative}%`);
  lines.push(`\nEMOTIONAL SIGNALS\nExcited: ${emotionalSignals.excited}% | Grateful: ${emotionalSignals.grateful}% | Curious: ${emotionalSignals.curious}% | Confused: ${emotionalSignals.confused}% | Critical: ${emotionalSignals.critical}% | Requesting: ${emotionalSignals.requesting}%`);
  if (themes.length) {
    lines.push(`\nCOMMENT THEMES (${themes.length} clusters)`);
    for (const t of themes) {
      lines.push(`  [${t.sentiment.toUpperCase()}] "${t.name}" (${t.commentCount} comments) — ${t.description}`);
      if (t.exampleComments[0]) lines.push(`    Example: "${t.exampleComments[0].slice(0, 100)}"`);
    }
  }
  if (videoIdeas.length) {
    lines.push(`\nVIDEO IDEAS FROM AUDIENCE QUESTIONS (${videoIdeas.length} ideas)`);
    for (const idea of videoIdeas) {
      lines.push(`  [${idea.estimatedDemand.toUpperCase()} demand] "${idea.idea}"`);
      lines.push(`    Source: "${idea.sourceComment.slice(0, 120)}"`);
    }
  }
  if (audiencePersonas.length) {
    lines.push(`\nAUDIENCE PERSONAS`);
    for (const p of audiencePersonas) {
      lines.push(`  ${p.type}: ${p.description}`);
    }
  }
  if (topCommenters.length) {
    lines.push(`\nMOST ENGAGED COMMENTERS (superfans)`);
    lines.push(topCommenters.slice(0, 5).map((c) => `  ${c.author} (${c.commentCount} comments)`).join("\n"));
  }
  return lines.join("\n");
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

Every recommendation in the brief MUST be tied to a specific data point from the channel or niche data (e.g. "niche median retention is 42%", "your #1 video got 3.2× your average views", "your top 3 videos all averaged 2.8× channel avg views"). Generic advice is not acceptable. This applies to the prediction too: projectedOutcome and basis must cite the creator's actual numbers — a concrete view count, their channel median, or a named comparable video from their own history — never a generic guess.

NEVER state a numeric figure (view count, multiplier, percentage, or retention rate) that is not present in the provided data. Do not estimate, round loosely, or invent numbers. If you lack a number to support a point, describe the pattern qualitatively instead of fabricating a figure. The only forward-looking numbers permitted are in prediction.projectedOutcome, which must still be derived from — and stated relative to — the comparable figures given in the data.

Return ONLY a single valid JSON object — no markdown, no explanation:

{
  "brief": {
    "weeklyIdea": "Specific, concrete video concept (not vague) grounded in the intersection of what this channel's data shows works and what the niche data confirms is in demand",
    "titleOptions": [
      "Title option 1 — use the highest-performing title pattern from this creator's top videos by views",
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
    "prediction": {
      "projectedOutcome": "A concrete performance call benchmarked against the RELEVANT COMPARABLE SET named in 'basis' — the creator's closest topic/format-matched videos, NOT the channel's overall median. Lead with a view range and the multiple vs that cohort's own average (e.g. 'likely 25K–40K views, ~1.6× the 24K average of your comparable [topic] videos'). Cite the overall channel median only as secondary context, never as the headline multiple (e.g. '…and ~1.8× your 14K channel median'). Never vague.",
      "basis": "Name the specific comparable set this prediction benchmarks against — the closest topic/format-matched videos from THEIR channel and that cohort's average, e.g. 'benchmarked against your 3 [topic] videos which averaged 24K (your video \"X\" hit 38K)'. This cohort — not the global median — is what projectedOutcome's headline multiple is measured against.",
      "confidence": "low, medium, or high — set by how much of their own data supports the comparison (number of comparable videos, strength/consistency of the retention and CTR signal). Use 'low' when comparables are thin (n<3)."
    },
    "keyTalkingPoints": ["point 1 with why this angle resonates based on data", "point 2", "point 3", "point 4"],
    "thumbnail": {
      "concept": "Overall visual concept in one sentence — what the viewer sees at a glance",
      "colours": "Specific colour palette (e.g. 'high-contrast red and white on dark background — your top-viewed videos all use this')",
      "composition": "Layout and framing notes (e.g. 'face takes left 60%, bold 2-word text right — mirrors your #1 video by views')",
      "textOverlay": "Exact text to use on the thumbnail (2–5 words max)",
      "faceExpression": "If relevant: expression/pose direction tied to the emotional hook"
    },
    "dataEvidence": [
      { "claim": "Why this topic", "evidence": "Cite the specific metric, video title, or niche stat that justifies this — e.g. 'Your 3 highest-performing videos all covered X, averaging 2.8× channel average views'" },
      { "claim": "Why this length", "evidence": "Specific data — e.g. 'Your retention drops below 40% after 14 min; niche top quartile is 10–14 min'" },
      { "claim": "Why this thumbnail approach", "evidence": "Specific data — e.g. 'Your top 3 videos by views all used this high-contrast red/white pattern'" },
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

function buildSynthesisInput(sp: SuccessPatterns, commentIntel: CommentIntelligence | null, channelTitle: string): string {
  const lines: string[] = [
    `CHANNEL: ${channelTitle}`,
    `Videos analysed: ${sp.totalVideos} · Median views: ${fmt(sp.channelMedianViews)}`,
    "",
  ];

  const confCats = sp.titleCategories.filter((c) => !c.lowConfidence).sort((a, b) => b.viewMultiplier - a.viewMultiplier);
  const confDurs = sp.durationBuckets.filter((b) => !b.lowConfidence).sort((a, b) => b.viewMultiplier - a.viewMultiplier);
  const confMechs = sp.titleMechanics.filter((m) => !m.lowConfidence).sort((a, b) => b.multiplier - a.multiplier);
  if (confCats.length || confDurs.length || confMechs.length) {
    lines.push("LAYER: PACKAGING");
    if (confCats[0]) lines.push(`  Best title category: "${confCats[0].name}" — ${confCats[0].viewMultiplier.toFixed(1)}× median, n=${confCats[0].n}`);
    if (confCats[1]) lines.push(`  2nd best: "${confCats[1].name}" — ${confCats[1].viewMultiplier.toFixed(1)}×, n=${confCats[1].n}`);
    if (confMechs[0]) lines.push(`  Strongest title mechanic: ${confMechs[0].label} — ${confMechs[0].multiplier.toFixed(1)}×`);
    if (confDurs[0]) lines.push(`  Best length: ${confDurs[0].label} — ${confDurs[0].viewMultiplier.toFixed(1)}×, n=${confDurs[0].n}`);
    lines.push("");
  }

  if (sp.retentionAnalysis) {
    const r = sp.retentionAnalysis;
    lines.push("LAYER: RETENTION");
    lines.push(`  Top performer avg retention: ${r.topMedianRetentionPct.toFixed(1)}% vs bottom ${r.bottomMedianRetentionPct.toFixed(1)}%`);
    if (r.relativeRetentionMedian !== null) lines.push(`  vs YouTube norm: ${r.relativeRetentionMedian.toFixed(1)}% relative retention (n=${r.relativeRetentionN})`);
    if (r.viewsRetentionDiverge) lines.push("  NOTE: views and retention diverge — high-click videos don't always hold attention");
    if (r.bestRetainedVideo) lines.push(`  Best retained: "${r.bestRetainedVideo.title.slice(0, 60)}" (${r.bestRetainedVideo.avgViewPct.toFixed(1)}%)`);
    lines.push("");
  }

  if (sp.growthAnalysis) {
    const g = sp.growthAnalysis;
    lines.push("LAYER: GROWTH");
    if (!g.thinSubsData) lines.push(`  Top converters: ${g.topMedianSubsGained} median subs/video vs channel median ${g.channelMedianSubsGained}`);
    if (g.aggregateTraffic) {
      const t = g.aggregateTraffic;
      lines.push(`  Traffic: algorithm ${t.algorithmPct.toFixed(0)}%, search ${t.searchPct.toFixed(0)}%, external ${t.externalPct.toFixed(0)}%`);
    }
    if (g.trafficInsight) lines.push(`  ${g.trafficInsight}`);
    if (g.trifectaDiverge && g.trifectaInsight) lines.push(`  ${g.trifectaInsight}`);
    if (g.conversionInsight) lines.push(`  ${g.conversionInsight}`);
    lines.push("");
  }

  if (sp.audienceAnalysis) {
    const a = sp.audienceAnalysis;
    lines.push("LAYER: AUDIENCE");
    if (a.dominantAgeGroup) lines.push(`  Core demographic: ${a.dominantAgeGroup} (${a.dominantAgeGroupPct?.toFixed(0) ?? "?"}%)`);
    if (a.under25Pct !== null) lines.push(`  Under-25: ${a.under25Pct.toFixed(0)}%`);
    if (a.malePct !== null) lines.push(`  Gender: ${a.malePct.toFixed(0)}% male / ${a.femalePct?.toFixed(0) ?? "?"}% female`);
    if (a.personaConfirmation) lines.push(`  ${a.personaConfirmation}`);
    lines.push("");
  }

  if (sp.cadenceAnalysis) {
    const c = sp.cadenceAnalysis;
    lines.push("LAYER: CADENCE");
    if (!c.thinData && c.bestDay) lines.push(`  Best day: ${c.bestDay} — ${c.bestDayMultiplier?.toFixed(1) ?? "?"}× median (reliable)`);
    if (c.topPerformerTimeSlot) lines.push(`  Top performers upload in the: ${c.topPerformerTimeSlot}`);
    if (c.frequencyInsight) lines.push(`  ${c.frequencyInsight}`);
    lines.push(`  Frequency vs performance: ${c.frequencyCorrelates}`);
    lines.push("");
  }

  if (sp.trajectoryAnalysis) {
    const t = sp.trajectoryAnalysis;
    lines.push("LAYER: TRAJECTORY");
    lines.push(`  Verdict: ${t.verdict}`);
    lines.push(`  ${t.verdictText}`);
    if (t.changePercent !== null) lines.push(`  QoQ change: ${t.changePercent > 0 ? "+" : ""}${Math.round(t.changePercent)}%`);
    lines.push("");
  }

  if (commentIntel && commentIntel.totalCommentsAnalysed >= 10) {
    lines.push("LAYER: COMMENTS");
    const signals = Object.entries(commentIntel.emotionalSignals).sort((a, b) => b[1] - a[1]).slice(0, 3);
    lines.push(`  Emotional signals: ${signals.map(([k, v]) => `${k} ${v}%`).join(", ")}`);
    if (commentIntel.themes.length) lines.push(`  Top themes: ${commentIntel.themes.slice(0, 3).map((t) => t.name).join(", ")}`);
    if (commentIntel.keyInsight) lines.push(`  Key insight: ${commentIntel.keyInsight.slice(0, 200)}`);
    if (commentIntel.videoIdeas.length) {
      lines.push(`  Audience-requested: ${commentIntel.videoIdeas.slice(0, 3).map((v) => v.idea.slice(0, 60)).join("; ")}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

const SYNTHESIS_SYSTEM = `You are a YouTube channel performance analyst. You receive data from six analysis layers for a specific channel.

Synthesize 3–5 cross-cutting, plain-English takeaways that CONNECT patterns across layers.

Do NOT re-list each section. Look for:
- Where multiple layers AGREE (compounding signal → double down)
- Actionable contradictions (e.g. story-hooks hold retention best but the creator rarely posts them)
- The single most reliable formula this channel has found
- What audience + comment data says the creator should lean into next

Rules:
- Only include takeaways backed by n≥3 data points; skip low-confidence signals
- Be specific — cite actual multipliers, percentages, and pattern names
- Each takeaway should reference at least 2 layers
- Headline: one honest verdict sentence citing the strongest cross-layer pattern

Return ONLY valid JSON, no markdown fences:
{
  "headline": "One-sentence verdict citing the strongest cross-layer pattern",
  "takeaways": [
    {
      "text": "Plain-English cross-cutting takeaway (1-2 sentences)",
      "evidence": "The specific numbers backing this — cite multipliers, %, layer names",
      "layers": ["packaging", "retention"]
    }
  ]
}

Valid layer names: "packaging", "retention", "growth", "audience", "cadence", "trajectory", "comments"`;

export async function computeChannelSynthesis(
  sp: SuccessPatterns,
  commentIntel: CommentIntelligence | null,
  channelTitle: string,
  onProgress?: (chars: number) => void,
): Promise<ChannelSynthesis> {
  const t0 = Date.now();
  const prompt = buildSynthesisInput(sp, commentIntel, channelTitle);
  console.log("[synthesis] Calling Claude (streaming). prompt=%d chars", prompt.length);

  // Streamed so the UI gets live progress instead of a static spinner during the call.
  let acc = 0;
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 1500,
    // Lowered from default to keep cross-layer takeaways tight to the computed data.
    temperature: 0.3,
    // Static system prompt (identical across every channel's synthesis) — cache it
    // so repeated runs within the cache window bill the system block at cache-read rate.
    system: [{ type: "text", text: SYNTHESIS_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: prompt }],
  });
  stream.on("text", (delta: string) => { acc += delta.length; onProgress?.(acc); });
  const message = await stream.finalMessage();

  console.log("[synthesis] Done in %dms. input=%d output=%d", Date.now() - t0, message.usage.input_tokens, message.usage.output_tokens);
  logUsage("synthesis", MODEL, message.usage);

  const raw = message.content[0].type === "text" ? message.content[0].text : "";
  const text = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

  const parsed = JSON.parse(text) as { headline: string; takeaways: ChannelSynthesis["takeaways"] };

  try {
    const fields: Record<string, string | undefined> = { headline: parsed.headline };
    (parsed.takeaways ?? []).forEach((t, i) => { fields[`takeaways[${i}].evidence`] = t?.evidence; });
    checkBriefGrounding(`synthesis:${channelTitle}`, { sp, commentIntel }, fields);
  } catch (e) {
    console.warn("[grounding] synthesis check failed (non-fatal):", e instanceof Error ? e.message : String(e));
  }

  return {
    headline: String(parsed.headline ?? ""),
    takeaways: (parsed.takeaways ?? []).slice(0, 5),
    generatedAt: new Date().toISOString(),
  };
}

export async function generateContentBrief(
  summary: ChannelSummary,
  nicheSummary: NicheSummary | null,
  igSummary: InstagramSummary | null = null,
  tikTokSummary: TikTokSummary | null = null,
  commentIntel: CommentIntelligence | null = null,
  onProgress?: (chars: number) => void
): Promise<{ brief: ContentBrief; autopsy: ContentAutopsy }> {
  const t0 = Date.now();
  const channelSection = buildChannelSection(summary);
  const nicheSection = nicheSummary ? buildNicheSection(nicheSummary) : "";
  const igSection = igSummary ? buildInstagramSection(igSummary) : "";
  const ttSection = tikTokSummary ? buildTikTokSection(tikTokSummary) : "";
  const commentSection = commentIntel && commentIntel.totalCommentsAnalysed >= 10 ? buildCommentIntelSection(commentIntel) : "";

  console.log("[claude] Prompt sections: channel=%d niche=%d instagram=%d tiktok=%d commentIntel=%d chars",
    channelSection.length, nicheSection.length, igSection.length, ttSection.length, commentSection.length);

  const prompt = [channelSection, nicheSection, igSection, ttSection, commentSection].join("\n");
  console.log("[claude] Total prompt: %d chars (~%d tokens estimated)", prompt.length, Math.round(prompt.length / 4));
  console.log("[claude] Summary shape: topPerformers=%d bottomPerformers=%d outliers=%d topCommenters=%d",
    summary.topPerformers.length, summary.bottomPerformers.length, summary.outliers.length,
    summary.topCommenters?.length ?? 0);
  console.log("[claude] Comment intel included: %s (comments=%d themes=%d videoIdeas=%d)",
    commentSection.length > 0 ? "YES" : "NO",
    commentIntel?.totalCommentsAnalysed ?? 0,
    commentIntel?.themes.length ?? 0,
    commentIntel?.videoIdeas.length ?? 0);

  let message: Anthropic.Message;
  try {
    console.log("[claude] Calling Anthropic API (streaming, max_tokens=8000)...");
    // Streamed: the brief is the largest output (~8k tokens) and the longest stage —
    // streaming feeds live progress to the UI and avoids SDK HTTP timeouts on long generations.
    let acc = 0;
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 8000,
      // Lowered from the default 1.0 to tighten adherence to the provided data and
      // reduce fabricated figures, while leaving room for creative titles/hooks.
      temperature: 0.5,
      // Large static strategist system prompt, identical for every brief — cache it
      // so concurrent/repeat brief generations within the window read it cheaply.
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: prompt }],
    });
    stream.on("text", (delta: string) => { acc += delta.length; onProgress?.(acc); });
    message = await stream.finalMessage();
    console.log("[claude] API response in %dms | stop_reason=%s | input_tokens=%d output_tokens=%d",
      Date.now() - t0, message.stop_reason, message.usage.input_tokens, message.usage.output_tokens);
    logUsage("brief", MODEL, message.usage);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[claude] Anthropic API call FAILED after %dms: %s", Date.now() - t0, msg);
    if (err instanceof Error && err.stack) console.error("[claude] Stack:", err.stack);
    throw new Error(`Brief generation API error: ${msg}`);
  }

  if (message.stop_reason === "max_tokens") {
    console.error("[claude] TRUNCATED — hit max_tokens=8000. input_tokens=%d output_tokens=%d prompt_chars=%d",
      message.usage.input_tokens, message.usage.output_tokens, prompt.length);
    throw new Error("Brief generation was truncated — prompt too long. Try with fewer data sources connected.");
  }

  const raw = message.content[0].type === "text" ? message.content[0].text : "";
  const text = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  console.log("[claude] Raw response: %d chars, starts with: %s", raw.length, raw.slice(0, 80).replace(/\n/g, "\\n"));

  let parsed: { brief: Record<string, unknown>; autopsy: ContentAutopsy };
  try {
    parsed = JSON.parse(text);
    console.log("[claude] JSON parsed OK. Top-level keys: %s", Object.keys(parsed).join(", "));
    if (parsed.brief) {
      console.log("[claude] brief keys: %s", Object.keys(parsed.brief).join(", "));
      console.log("[claude] brief.titleOptions=%d hook=%s thumbnail=%s dataEvidence=%d",
        Array.isArray(parsed.brief.titleOptions) ? parsed.brief.titleOptions.length : "missing",
        typeof parsed.brief.hook === "object" ? "object" : typeof parsed.brief.hook,
        typeof parsed.brief.thumbnail === "object" ? "object" : typeof parsed.brief.thumbnail,
        Array.isArray(parsed.brief.dataEvidence) ? parsed.brief.dataEvidence.length : "missing"
      );
    }
  } catch (err) {
    console.error("[claude] JSON.parse FAILED: %s", err instanceof Error ? err.message : String(err));
    console.error("[claude] Raw response (first 800 chars):\n%s", text.slice(0, 800));
    console.error("[claude] Raw response (last 200 chars):\n%s", text.slice(-200));
    throw new Error(`Brief JSON parse failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!parsed.brief || !parsed.autopsy) {
    console.error("[claude] Response missing brief or autopsy. Keys present: %s", Object.keys(parsed).join(", "));
    throw new Error("Brief response missing required keys (brief/autopsy)");
  }

  const rawPrediction = parsed.brief.prediction as Partial<BriefPrediction> | undefined;
  const prediction: BriefPrediction | undefined =
    rawPrediction && (rawPrediction.projectedOutcome || rawPrediction.basis)
      ? {
          projectedOutcome: String(rawPrediction.projectedOutcome ?? ""),
          basis: String(rawPrediction.basis ?? ""),
          confidence: (["low", "medium", "high"].includes(rawPrediction.confidence as string)
            ? rawPrediction.confidence
            : "medium") as BriefPrediction["confidence"],
        }
      : undefined;

  const brief: ContentBrief = {
    weeklyIdea: String(parsed.brief.weeklyIdea ?? ""),
    titleOptions: ((parsed.brief.titleOptions as string[]) ?? []).slice(0, 3),
    hook: (parsed.brief.hook as ContentBrief["hook"]) ?? "",
    recommendedLength: String(parsed.brief.recommendedLength ?? ""),
    format: String(parsed.brief.format ?? ""),
    prediction,
    // Legacy string only if the model still returned one; new briefs use `prediction`.
    ...(parsed.brief.estimatedPerformance != null && { estimatedPerformance: String(parsed.brief.estimatedPerformance) }),
    keyTalkingPoints: (parsed.brief.keyTalkingPoints as string[]) ?? [],
    thumbnail: (parsed.brief.thumbnail as ContentBrief["thumbnail"]) ?? String(parsed.brief.thumbnailDirection ?? ""),
    dataEvidence: (parsed.brief.dataEvidence as ContentBrief["dataEvidence"]) ?? [],
  };

  console.log("[claude] Brief generated in %dms. weeklyIdea='%s...' titleOptions=%d dataEvidence=%d",
    Date.now() - t0, brief.weeklyIdea.slice(0, 60), brief.titleOptions.length, brief.dataEvidence.length);

  // Non-destructive grounding check: log any backward-looking metric claim that
  // isn't traceable to the source summary. projectedOutcome is excluded (forward-looking).
  try {
    const ap = parsed.autopsy;
    const groundingFields: Record<string, string | undefined> = {
      "prediction.basis": brief.prediction?.basis,
      "autopsy.topPerformerPattern": ap?.topPerformerPattern,
      "autopsy.bottomPerformerPattern": ap?.bottomPerformerPattern,
      ...Object.fromEntries((brief.dataEvidence ?? []).map((e, i) => [`dataEvidence[${i}]`, e?.evidence])),
      ...Object.fromEntries((ap?.whatIsWorking ?? []).map((t, i) => [`autopsy.whatIsWorking[${i}]`, t])),
      ...Object.fromEntries((ap?.whatIsNotWorking ?? []).map((t, i) => [`autopsy.whatIsNotWorking[${i}]`, t])),
    };
    checkBriefGrounding(`brief:${summary.channel.title}`, summary, groundingFields);
  } catch (e) {
    console.warn("[grounding] check failed (non-fatal):", e instanceof Error ? e.message : String(e));
  }

  return { brief, autopsy: parsed.autopsy };
}
