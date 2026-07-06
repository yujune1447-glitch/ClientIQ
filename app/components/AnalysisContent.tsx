"use client";

import { useState, useEffect, useRef } from "react";
import {
  TrendingUp, TrendingDown, PlayCircle, Eye, ThumbsUp,
  MessageSquare, Target, Bell, Camera, Heart, Music2, Share2,
  Loader2, Send, BookmarkPlus, Sparkles, Clock, Type, Zap,
  User, ListOrdered, Calendar, Hash,
} from "lucide-react";
import { MarkRead } from "@/app/components/MarkRead";
import { SavedIdeasBoard } from "@/app/components/SavedIdeasBoard";
import { RetentionSection } from "@/app/components/RetentionSection";
import { GrowthSection } from "@/app/components/GrowthSection";
import { AudienceSection } from "@/app/components/AudienceSection";
import { CadenceSection } from "@/app/components/CadenceSection";
import { TrajectorySection } from "@/app/components/TrajectorySection";
import { ChannelSynthesisSection } from "@/app/components/ChannelSynthesisSection";
import { useChatStream, type ChatMsg } from "@/app/hooks/useChatStream";
import type {
  ChannelSummary, ContentAutopsy, VideoWithScore,
  ChannelSnapshot, InstagramSummary, TikTokSummary, CommentIntelligence,
  ContentBrief, HookEntry, HookAnalysis,
} from "@/types";

export interface AnalysisData {
  id: string;
  createdAt: string;
  summary: ChannelSummary;
  brief: ContentBrief | null;
  autopsy: ContentAutopsy | null;
  igSummary: InstagramSummary | null;
  tikTokSummary: TikTokSummary | null;
  commentIntel: CommentIntelligence | null;
  isUnread: boolean;
  isScheduled: boolean;
}

type Period = "weekly" | "monthly" | "alltime";

function buildPlanInitPrompt(summary: ChannelSummary, commentIntel: CommentIntelligence | null): string {
  const sp = summary.successPatterns;
  const { channel } = summary;

  const dataLines: string[] = [];

  if (sp?.synthesis?.headline) {
    dataLines.push(`Channel verdict: ${sp.synthesis.headline}`);
    dataLines.push("");
  }

  if (sp?.synthesis?.takeaways.length) {
    dataLines.push("Proven patterns on this channel:");
    for (const t of sp.synthesis.takeaways) {
      dataLines.push(`• ${t.text} — evidence: ${t.evidence}`);
    }
    dataLines.push("");
  } else if (sp) {
    const confCats = sp.titleCategories.filter((c) => !c.lowConfidence).sort((a, b) => b.viewMultiplier - a.viewMultiplier);
    const confDurs = sp.durationBuckets.filter((b) => !b.lowConfidence).sort((a, b) => b.viewMultiplier - a.viewMultiplier);
    if (confCats[0]) dataLines.push(`• Best title format: ${confCats[0].name} (${confCats[0].viewMultiplier.toFixed(1)}× median, n=${confCats[0].n})`);
    if (confDurs[0]) dataLines.push(`• Optimal length: ${confDurs[0].label} (${confDurs[0].viewMultiplier.toFixed(1)}×)`);
    if (sp.cadenceAnalysis?.bestDay && !sp.cadenceAnalysis.thinData) {
      dataLines.push(`• Best posting day: ${sp.cadenceAnalysis.bestDay} (${sp.cadenceAnalysis.bestDayMultiplier?.toFixed(1)}×)`);
    }
    if (sp.trajectoryAnalysis && sp.trajectoryAnalysis.verdict !== "insufficient_data") {
      dataLines.push(`• Trajectory: ${sp.trajectoryAnalysis.verdict}`);
    }
    dataLines.push("");
  }

  if (commentIntel && commentIntel.totalCommentsAnalysed >= 10 && commentIntel.videoIdeas.length) {
    dataLines.push("Audience-requested topics:");
    for (const idea of commentIntel.videoIdeas.slice(0, 3)) {
      dataLines.push(`• ${idea.idea} (${idea.estimatedDemand} demand)`);
    }
    dataLines.push("");
  }

  const contextBlock = dataLines.length > 0
    ? `## Channel Performance Grounding\n\n${dataLines.join("\n")}\n---\n\n`
    : "";

  return `${contextBlock}You are a content planning partner for ${channel.title}. You have their channel performance data in your context — top performers, engagement patterns, audience signals, and the proven patterns above.

Open with 3–5 short concept suggestions GROUNDED in this channel’s actual performance data. Each concept must tie back to one of the proven patterns shown above. Cite the specific evidence when presenting each concept.

Format each concept as:
• [Title] — [one-line hook] _(ties to: [specific data point])_

Nothing more. No outlines, no hook breakdowns, no length estimates yet.

After the list, end with exactly this: "Pick one, tell me to combine or adjust, or tell me what you actually want to make instead."

Once the creator commits to a single concept (picked from your list or their own idea):
- Ask at most 1–2 brief clarifying questions only if something critical is missing (e.g. target length if not obvious from the concept)
- Then generate a full content structure using exactly these markdown headers in order: **Title**, **Hook**, **Optimal Length**, **Outline**, **Why it’ll work**

The **Why it’ll work** section MUST cite specific metrics from the channel data above — multipliers, retention percentages, audience signals, cadence patterns — not generic best practices. Example: "This uses the question-title format that averages 2.1× your channel median. Posted on your strongest day, it targets your 18–24 core audience who drive 67% of your curious emotional signals."`;
}

function extractIdeas(text: string): Array<{ title: string; hook: string; length: string; structure: string; why_it_works: string }> {
  const normalized = text.replace(/\r/g, "");
  const ideas: Array<{ title: string; hook: string; length: string; structure: string; why_it_works: string }> = [];
  const titleRe = /\*\*Title\*\*:?\s*(.+)/gi;
  const titles: Array<{ index: number; title: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = titleRe.exec(normalized)) !== null) {
    titles.push({ index: m.index, title: m[1].trim() });
  }
  for (let t = 0; t < titles.length; t++) {
    const block = normalized.slice(titles[t].index, t + 1 < titles.length ? titles[t + 1].index : normalized.length);
    const field = (...keys: string[]): string => {
      for (const key of keys) {
        const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const hit = block.match(new RegExp(`\\*\\*${esc}\\*\\*:?\\s*([\\s\\S]+?)(?=\\n\\*\\*|\\n---|-{3,}|$)`, "i"));
        const val = hit?.[1]?.trim();
        if (val) return val;
      }
      return "";
    };
    ideas.push({
      title: titles[t].title,
      hook: field("Hook"),
      length: field("Optimal Length", "Length", "Optimal length"),
      structure: field("Outline", "Structure", "Video Outline", "Video Structure"),
      why_it_works: field("Why it’ll work", "Why it will work", "Why this works", "Why"),
    });
  }
  return ideas;
}

const PERIODS: { key: Period; label: string }[] = [
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "alltime", label: "All Time" },
];

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function relDate(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff}d ago`;
  if (diff < 30) return `${Math.floor(diff / 7)}w ago`;
  if (diff < 365) return `${Math.floor(diff / 30)}mo ago`;
  return `${Math.floor(diff / 365)}y ago`;
}

function filterByPeriod(videos: VideoWithScore[], period: Period, analysisDate: string): VideoWithScore[] {
  if (period === "alltime") return videos;
  const cutoff = new Date(analysisDate);
  cutoff.setDate(cutoff.getDate() - (period === "weekly" ? 7 : 30));
  return videos.filter((v) => new Date(v.publishedAt) >= cutoff);
}

function computeSubDelta(snapshots: ChannelSnapshot[], period: Period, analysisDate: string): number | null {
  if (snapshots.length < 2) return null;
  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const latest = sorted[sorted.length - 1];
  if (period === "alltime") return latest.subscriber_count - sorted[0].subscriber_count;
  const cutoff = new Date(analysisDate);
  cutoff.setDate(cutoff.getDate() - (period === "weekly" ? 7 : 30));
  const older = sorted.filter((s) => new Date(s.created_at) <= cutoff);
  if (!older.length) return null;
  return latest.subscriber_count - older[older.length - 1].subscriber_count;
}

function parseDurationSeconds(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] ?? "0") * 3600) + (parseInt(m[2] ?? "0") * 60) + parseInt(m[3] ?? "0");
}

function fmtMins(seconds: number): string {
  return `${Math.round(seconds / 60)}m`;
}

interface TitleCategory {
  key: string;
  name: string;
  description: string;
  formula: string;
  color: string;
  Icon: React.ElementType;
  examples: string[];
  bottomExamples: string[];
}

function extractTitleCategories(topTitles: string[], bottomTitles: string[]): TitleCategory[] {
  const defs: Array<Omit<TitleCategory, "examples" | "bottomExamples"> & { test: (t: string) => boolean }> = [
    {
      key: "reassurance",
      name: "Reassurance / Permission-giving",
      description: "Converts viewer anxiety into relief by granting explicit permission to feel or stop",
      formula: "[You don't have to / It's okay to] [do/feel X]",
      color: "rose",
      Icon: Heart,
      test: (t) => /\b(you don'?t have to|it'?s (ok|okay)\b|you'?re allowed|give yourself|be gentle|you are enough|take a (deep )?breath|no pressure|let yourself|not your fault|you don'?t need to|stop (feeling|worrying|pushing)|allow yourself)\b/i.test(t),
    },
    {
      key: "timing",
      name: "Timing / Destiny framing",
      description: "Implies the viewer arrived at exactly the right moment — transforms a click into a meaningful encounter",
      formula: "You'll [see/find] this when [the time is right / you need it]",
      color: "amber",
      Icon: Sparkles,
      test: (t) => /\b(when the time|when you need|meant to (find|see|hear|watch)|right time|divine timing|trust the process|found this for a reason|not a coincidence|exactly where you|where you'?re? meant)\b/i.test(t),
    },
    {
      key: "personal-journey",
      name: "Personal journey / First-person",
      description: "Positions the creator as a fellow traveller, not an expert — makes the story feel relatable and lived-in",
      formula: "How I [verb]ed [X] / I [tried/quit/left] [X]",
      color: "blue",
      Icon: User,
      test: (t) => /^(how i|why i|what i|i tried|i quit|i spent|i made|i built|i only|i stopped|i started|i learned|i realized|i chose|i left|i moved|i went|i found|i lost|i used|i switched)\b/i.test(t),
    },
    {
      key: "question",
      name: "Direct question / Curiosity gap",
      description: "Opens a loop the brain can't close — viewer clicks to resolve the tension the title creates",
      formula: "[Are you / Do you / Why do / What if] [X]?",
      color: "violet",
      Icon: MessageSquare,
      test: (t) => /\?\s*$/.test(t.trim()),
    },
    {
      key: "list",
      name: "List / Countdown structure",
      description: "Signals a defined, scannable payoff — viewers know exactly what they're getting before they click",
      formula: "[N] [things/signs/reasons/ways] [you/to X]",
      color: "teal",
      Icon: ListOrdered,
      test: (t) => /^\d+\s+\w/i.test(t),
    },
  ];

  return defs
    .map(({ test, ...rest }) => ({
      ...rest,
      examples: topTitles.filter(test).slice(0, 8),
      bottomExamples: bottomTitles.filter(test).slice(0, 4),
    }))
    .filter((c) => c.examples.length >= 2)
    .sort((a, b) => b.examples.length - a.examples.length);
}

function extractHookClusters(titles: string[]): Array<{ label: string; examples: string[] }> {
  const defs: Array<{ label: string; test: (t: string) => boolean }> = [
    { label: "Second-person direct address", test: (t) => /\b(you|your|you'?re|you'?ve|you'?ll)\b/i.test(t) },
    { label: "Timing / transformation promise", test: (t) => /\b\d+\s*(day|week|month|year|hour|minute)s?\b/i.test(t) || /\bin \d+\b/i.test(t) },
    { label: "First-person story", test: (t) => /^(how i|why i|what i|i tried|i quit|i spent|i made|i built|i only|i stopped)\b/i.test(t) },
    { label: "List / countdown", test: (t) => /^\d+\s+(things?|ways?|tips?|reasons?|mistakes?|habits?|steps?)\b/i.test(t) },
    { label: "Lowercase / casual tone", test: (t) => t === t.toLowerCase() || /^[a-z]/.test(t) },
  ];
  return defs
    .map(({ label, test }) => ({ label, examples: titles.filter(test).slice(0, 5) }))
    .filter((c) => c.examples.length >= 2)
    .slice(0, 5);
}

function buildTitlesInsight(categories: TitleCategory[], total: number): string {
  if (!categories.length || total === 0) return "";
  const top = categories[0];
  const second = categories[1];
  const pct = Math.round((top.examples.length / total) * 100);
  let s = `${top.examples.length} of your ${total} top performers use ${top.name.toLowerCase()} titles — roughly ${pct}% of your strongest content leans on this pattern.`;
  if (second) {
    s += ` The ${second.name.toLowerCase()} format appears ${second.examples.length} times as well, suggesting your audience also responds to ${second.description.toLowerCase()}.`;
  }
  s += " These patterns are consistent enough to treat as repeatable templates rather than reinventing your approach each time.";
  return s;
}

function buildLengthInsight(avgTopSec: number, topLengthRange: string, avgBotSec: number, botLengthRange: string, topCount: number, botCount: number): string {
  if (!topCount) return "";
  let s = `Your top performers run ${topLengthRange}, averaging ${fmtMins(avgTopSec)} across ${topCount} videos.`;
  if (botCount > 0 && avgBotSec > 0) {
    const diff = Math.round(avgBotSec / 60) - Math.round(avgTopSec / 60);
    const absDiff = Math.abs(diff);
    if (absDiff >= 2) {
      const direction = diff > 0 ? "longer" : "shorter";
      s += ` Your lowest performers average ${fmtMins(avgBotSec)} (${botLengthRange}) — ${absDiff} minute${absDiff !== 1 ? "s" : ""} ${direction}.`;
      s += diff > 0
        ? " Your audience tends to disengage before the longer format pays off — tighter is better."
        : " Your audience rewards depth; longer content is consistently outperforming, so there's room to go further.";
    } else {
      s += ` Bottom performers run a similar length (${botLengthRange}), so duration alone isn't the differentiator — look to topic and hook quality instead.`;
    }
  } else {
    s += ` Keep new videos in this window — it's where your audience retention is strongest.`;
  }
  return s;
}

export function AnalysisContent({
  analysis,
  snapshots,
  platformFilter,
}: {
  analysis: AnalysisData;
  snapshots: ChannelSnapshot[];
  platformFilter?: "youtube" | "instagram" | "tiktok";
}) {
  const { summary, autopsy, igSummary, tikTokSummary, isUnread, isScheduled, id, createdAt } = analysis;
  const { channel, averages, topPerformers, bottomPerformers } = summary;

  // ── Instagram view ──────────────────────────────────────────────────────────
  if (platformFilter === "instagram") {
    return (
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-xl font-bold">Instagram Analytics</h1>
          {igSummary && <p className="text-sm text-zinc-500 mt-0.5">@{igSummary.username}</p>}
        </div>
        {igSummary ? (
          <>
            <div className="grid sm:grid-cols-4 gap-3">
              {[
                { label: "Followers", value: fmt(igSummary.followerCount) },
                { label: "Avg likes", value: fmt(igSummary.averages.likes) },
                { label: "Avg reach", value: fmt(igSummary.averages.reach) },
                { label: "Engagement rate", value: `${igSummary.averages.engagementRate}%` },
              ].map((s) => (
                <div key={s.label} className="bg-[#111113] border border-[#27272a] rounded-xl p-4 text-center">
                  <p className="text-xl font-bold tabular-nums">{s.value}</p>
                  <p className="text-[11px] text-zinc-600 mt-1">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="bg-[#111113] border border-[#27272a] rounded-xl p-6">
              <p className="text-xs text-zinc-600 uppercase tracking-wider mb-4">Top posts by engagement</p>
              <div className="space-y-2">
                {igSummary.topPosts.slice(0, 10).map((post, i) => (
                  <a
                    key={post.id}
                    href={post.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 hover:bg-[#1a1a1d] rounded-lg px-3 py-2.5 transition-colors group"
                  >
                    <span className="text-xs font-mono text-zinc-600 w-5 shrink-0">#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-300 truncate group-hover:text-white transition-colors">
                        {post.caption?.slice(0, 80) || "(no caption)"}
                      </p>
                      <p className="text-[11px] text-zinc-600">{post.media_type} · {post.timestamp.slice(0, 10)}</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-zinc-500 shrink-0">
                      <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{fmt(post.like_count)}</span>
                      <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{post.comments_count}</span>
                      <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{fmt(post.reach)}</span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </>
        ) : (
          <a
            href="/api/auth/instagram"
            className="flex items-center gap-4 bg-[#111113] border border-[#1f1f22] hover:border-[#27272a] rounded-xl p-5 transition-colors group"
          >
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center shrink-0">
              <Camera className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-400 group-hover:text-white transition-colors">Connect Instagram</p>
              <p className="text-xs text-zinc-700">Add cross-platform audience signals to your next brief</p>
            </div>
          </a>
        )}
        <div className="pb-4" />
      </div>
    );
  }

  // ── TikTok view ─────────────────────────────────────────────────────────────
  if (platformFilter === "tiktok") {
    return (
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-xl font-bold">TikTok Analytics</h1>
          {tikTokSummary && <p className="text-sm text-zinc-500 mt-0.5">{tikTokSummary.displayName}</p>}
        </div>
        {tikTokSummary ? (
          <>
            <div className="grid sm:grid-cols-4 gap-3">
              {[
                { label: "Followers", value: fmt(tikTokSummary.followerCount) },
                { label: "Avg views", value: fmt(tikTokSummary.averages.views) },
                { label: "Avg likes", value: fmt(tikTokSummary.averages.likes) },
                { label: "Engagement rate", value: `${tikTokSummary.averages.engagementRate}%` },
              ].map((s) => (
                <div key={s.label} className="bg-[#111113] border border-[#27272a] rounded-xl p-4 text-center">
                  <p className="text-xl font-bold tabular-nums">{s.value}</p>
                  <p className="text-[11px] text-zinc-600 mt-1">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="bg-[#111113] border border-[#27272a] rounded-xl p-6">
              <p className="text-xs text-zinc-600 uppercase tracking-wider mb-4">Top videos by views</p>
              <div className="space-y-2">
                {tikTokSummary.topVideos.slice(0, 10).map((video, i) => (
                  <a
                    key={video.id}
                    href={video.share_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 hover:bg-[#1a1a1d] rounded-lg px-3 py-2.5 transition-colors group"
                  >
                    <span className="text-xs font-mono text-zinc-600 w-5 shrink-0">#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-300 truncate group-hover:text-white transition-colors">
                        {video.title || video.video_description.slice(0, 80) || "(untitled)"}
                      </p>
                      <p className="text-[11px] text-zinc-600">
                        {video.duration}s · {new Date(video.create_time * 1000).toISOString().slice(0, 10)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-zinc-500 shrink-0">
                      <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{fmt(video.view_count)}</span>
                      <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{fmt(video.like_count)}</span>
                      <span className="flex items-center gap-1"><Share2 className="w-3 h-3" />{fmt(video.share_count)}</span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </>
        ) : (
          <a
            href="/api/auth/tiktok"
            className="flex items-center gap-4 bg-[#111113] border border-[#1f1f22] hover:border-[#27272a] rounded-xl p-5 transition-colors group"
          >
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-[#EE1D52] flex items-center justify-center shrink-0">
              <Music2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-400 group-hover:text-white transition-colors">Connect TikTok</p>
              <p className="text-xs text-zinc-700">Add short-form video signals to your next brief</p>
            </div>
          </a>
        )}
        <div className="pb-4" />
      </div>
    );
  }

  // ── YouTube view ─────────────────────────────────────────────────────────────
  return <YouTubeView analysis={analysis} snapshots={snapshots} />;
}

type YtTab = "live" | "analysis" | "ideas" | "channel-ideas";
const YT_TABS: { key: YtTab; label: string }[] = [
  { key: "live", label: "Live Stats" },
  { key: "analysis", label: "Channel Analysis" },
  { key: "ideas", label: "Planning Content" },
  { key: "channel-ideas", label: "Channel Ideas" },
];

function YouTubeView({ analysis, snapshots }: { analysis: AnalysisData; snapshots: ChannelSnapshot[] }) {
  const { summary, autopsy, isUnread, isScheduled, id, createdAt } = analysis;
  const { channel, averages, topPerformers, bottomPerformers } = summary;

  const [tab, setTab] = useState<YtTab>("live");
  const [period, setPeriod] = useState<Period>("monthly");

  const { messages: planMsgs, setMessages: setPlanMsgs, loading: planLoading, append: planAppend } = useChatStream(id);
  const [planInput, setPlanInput] = useState("");
  const [planSaveStatus, setPlanSaveStatus] = useState<Map<number, "saving" | "saved" | "error">>(new Map());
  const planChatId = useRef(crypto.randomUUID());
  const planInitRef = useRef(false);
  const planEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tab !== "ideas" || planInitRef.current) return;
    planInitRef.current = true;
    const hidden: ChatMsg = { role: "user", content: buildPlanInitPrompt(summary, analysis.commentIntel), hidden: true };
    setPlanMsgs([hidden]);
    planAppend([hidden]);
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab === "ideas") planEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [planMsgs, tab]);

  const handlePlanSend = async () => {
    const text = planInput.trim();
    if (!text || planLoading) return;
    setPlanInput("");
    const userMsg: ChatMsg = { role: "user", content: text };
    const updated = [...planMsgs, userMsg];
    setPlanMsgs(updated);
    await planAppend(updated);
  };

  const saveIdeasFromMsg = async (msgIndex: number, msgText: string) => {
    setPlanSaveStatus((prev) => new Map(prev).set(msgIndex, "saving"));
    try {
      const ideas = extractIdeas(msgText);
      await Promise.all(
        ideas.map((idea) =>
          fetch("/api/saved-ideas", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              platform: "youtube",
              title: idea.title,
              hook: idea.hook || null,
              length: idea.length || null,
              structure: idea.structure || null,
              why_it_works: idea.why_it_works || null,
              source: "ai",
              source_chat_id: planChatId.current,
            }),
          })
        )
      );
      setPlanSaveStatus((prev) => new Map(prev).set(msgIndex, "saved"));
    } catch {
      setPlanSaveStatus((prev) => new Map(prev).set(msgIndex, "error"));
    }
  };

  // Recent videos pool — used for period-filtered views, watch time, top content, comments.
  // topPerformers/bottomPerformers are kept separate (score-based, all-time) for Success Patterns.
  const recentPool: VideoWithScore[] = summary.recentVideos ?? [];

  const periodVideos = filterByPeriod(recentPool, period, createdAt);
  const sortedByViews = [...periodVideos].sort((a, b) => b.viewCount - a.viewCount);

  const totalPeriodViews = periodVideos.reduce((s, v) => s + v.viewCount, 0);
  const totalWatchHours = periodVideos.reduce((s, v) => {
    return s + ((v.averageViewDuration ?? 0) * v.viewCount) / 3600;
  }, 0);
  const subDelta = computeSubDelta(snapshots, period, createdAt);

  // Recent comments from most recently published videos
  const commentEntries: { author: string; text: string; videoTitle: string; date: string }[] = [];
  const videosWithComments = [...topPerformers, ...bottomPerformers]
    .filter((v) => v.topComments?.length)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  outer: for (const v of videosWithComments) {
    for (let i = 0; i < (v.topComments?.length ?? 0); i++) {
      commentEntries.push({
        author: v.topCommentAuthors?.[i] ?? "Viewer",
        text: v.topComments![i],
        videoTitle: v.title,
        date: v.publishedAt,
      });
      if (commentEntries.length >= 20) break outer;
    }
  }

  const periodLabel = period === "weekly" ? "last 7 days" : period === "monthly" ? "last 30 days" : "all time";

  const topDurations = topPerformers.map((v) => parseDurationSeconds(v.duration)).filter((s) => s > 0);
  const botDurations = bottomPerformers.map((v) => parseDurationSeconds(v.duration)).filter((s) => s > 0);
  const avgTopSec = topDurations.length ? Math.round(topDurations.reduce((a, b) => a + b, 0) / topDurations.length) : 0;
  const avgBotSec = botDurations.length ? Math.round(botDurations.reduce((a, b) => a + b, 0) / botDurations.length) : 0;
  const minTopSec = topDurations.length ? Math.min(...topDurations) : 0;
  const maxTopSec = topDurations.length ? Math.max(...topDurations) : 0;
  const minBotSec = botDurations.length ? Math.min(...botDurations) : 0;
  const maxBotSec = botDurations.length ? Math.max(...botDurations) : 0;
  const topLengthRange = fmtMins(minTopSec) === fmtMins(maxTopSec) ? fmtMins(avgTopSec) : `${fmtMins(minTopSec)}–${fmtMins(maxTopSec)}`;
  const botLengthRange = fmtMins(minBotSec) === fmtMins(maxBotSec) ? fmtMins(avgBotSec) : `${fmtMins(minBotSec)}–${fmtMins(maxBotSec)}`;
  const titleCategories = extractTitleCategories(topPerformers.map((v) => v.title), bottomPerformers.map((v) => v.title));
  const hookClusters = extractHookClusters(topPerformers.map((v) => v.title));
  const bottomHookClusters = extractHookClusters(bottomPerformers.map((v) => v.title));
  const sp = summary.successPatterns;
  const maxDurAvg = sp && sp.durationBuckets.length ? Math.max(...sp.durationBuckets.map((b) => b.medianViews), 1) : 1;
  const maxDayAvg = sp && sp.postingTiming.byDayOfWeek.length ? Math.max(...sp.postingTiming.byDayOfWeek.map((d) => d.medianViews), 1) : 1;
  const maxSlotAvg = sp && sp.postingTiming.byTimeOfDay.length ? Math.max(...sp.postingTiming.byTimeOfDay.map((s) => s.medianViews), 1) : 1;
  const mColor = (m: number) => m >= 1.5 ? "text-emerald-400" : m >= 1.2 ? "text-blue-400" : m < 0.8 ? "text-red-400" : "text-zinc-500";
  const mBg = (m: number) => m >= 1.5 ? "bg-emerald-500/10 border-emerald-900/30" : m >= 1.2 ? "bg-blue-500/10 border-blue-900/30" : m < 0.8 ? "bg-red-500/10 border-red-900/30" : "bg-zinc-800/30 border-[#27272a]";
  const mBar = (m: number) => m >= 1.5 ? "bg-emerald-500" : m >= 1.2 ? "bg-blue-500" : m < 0.8 ? "bg-red-800" : "bg-zinc-600";

  return (
    <div className="min-h-full">
      {isUnread && <MarkRead analysisId={id} />}

      {isUnread && isScheduled && (
        <div className="bg-[#1a1014] border-b border-[#ff3040]/30 px-6 py-2.5 flex items-center justify-center gap-2">
          <Bell className="w-3.5 h-3.5 text-[#ff3040]" />
          <p className="text-xs text-zinc-300">
            Your weekly brief was automatically generated. New intelligence every Monday.
          </p>
        </div>
      )}

      {/* Channel header — always visible */}
      <div className="border-b border-[#1f1f22]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex items-center gap-3 pt-6 pb-4">
            {channel.thumbnail ? (
              <img src={channel.thumbnail} alt="" className="w-9 h-9 rounded-full object-cover" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-[#ff3040] flex items-center justify-center shrink-0">
                <PlayCircle className="w-4 h-4 text-white" />
              </div>
            )}
            <div>
              <h1 className="text-base font-semibold leading-tight">{channel.title}</h1>
              <p className="text-[11px] text-zinc-500">
                Analysed {new Date(createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-5 text-right">
              <div>
                <p className="text-sm font-bold tabular-nums">{fmt(channel.subscriberCount)}</p>
                <p className="text-[10px] text-zinc-600">Subscribers</p>
              </div>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex gap-0">
            {YT_TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors ${
                  tab === key
                    ? "border-[#ff3040] text-white"
                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tab: Live Stats ── */}
      {tab === "live" && (
        <div className="max-w-5xl mx-auto px-6 py-6 space-y-4 pb-24">

          {/* Period toggle */}
          <div className="flex items-center gap-1 bg-[#111113] border border-[#1f1f22] rounded-lg p-1 w-fit">
            {PERIODS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setPeriod(key)}
                className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  period === key
                    ? "bg-[#1c1c1f] text-white shadow-sm"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Channel Overview */}
          <Card title="Channel Overview">
            <div className="flex divide-x divide-[#1f1f22]">
              <StatBlock
                label="Subscribers"
                value={fmt(channel.subscriberCount)}
                delta={subDelta}
                sub={`change, ${periodLabel}`}
              />
              <StatBlock
                label="Views"
                value={periodVideos.length > 0 ? fmt(totalPeriodViews) : "—"}
                sub={`from ${periodVideos.length} video${periodVideos.length !== 1 ? "s" : ""}, ${periodLabel}`}
              />
              <StatBlock
                label="Watch Time"
                value={totalWatchHours > 0.1 ? `${totalWatchHours < 1000 ? totalWatchHours.toFixed(1) : fmt(Math.round(totalWatchHours))}h` : "—"}
                sub="estimated hours"
              />
              <StatBlock
                label="Avg Views / Video"
                value={fmt(averages.views)}
                sub="across all analysed"
              />
            </div>
          </Card>

          {/* Estimated Minutes Watched */}
          {totalWatchHours > 0 && (
            <div className="bg-[#111113] border border-[#1f1f22] rounded-xl px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock className="w-4 h-4 text-zinc-600" />
                <div>
                  <p className="text-[11px] text-zinc-500 mb-0.5">Estimated Minutes Watched</p>
                  <p className="text-xl font-bold tabular-nums">{fmt(Math.round(totalWatchHours * 60))} min</p>
                </div>
              </div>
              <p className="text-[10px] text-zinc-700">{periodLabel}</p>
            </div>
          )}

          {/* Top Content + Recent Comments — hidden on All Time (Video Performance covers it) */}
          {period !== "alltime" && <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-3">
              <Card title="Top Content" subtitle={`By views · ${periodLabel}`}>
                {sortedByViews.length > 0 ? (
                  <div className="space-y-0.5">
                    {sortedByViews.slice(0, 10).map((v, i) => (
                      <a
                        key={v.id}
                        href={`https://youtube.com/watch?v=${v.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#161618] transition-colors group"
                      >
                        <span className="text-[11px] font-mono text-zinc-600 w-4 shrink-0 text-right">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-zinc-300 truncate group-hover:text-white transition-colors leading-tight">
                            {v.title}
                          </p>
                          <p className="text-[10px] text-zinc-600 mt-0.5">{relDate(v.publishedAt)}</p>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-zinc-500 shrink-0">
                          <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{fmt(v.viewCount)}</span>
                          <span className="flex items-center gap-1"><ThumbsUp className="w-3 h-3" />{fmt(v.likeCount)}</span>
                        </div>
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-600 py-6 text-center">No videos published in this period.</p>
                )}
              </Card>
            </div>

            <div className="lg:col-span-2">
              <Card title="Recent Comments">
                {commentEntries.length > 0 ? (
                  <div className="space-y-4 max-h-[440px] overflow-y-auto pr-1 scrollbar-thin">
                    {commentEntries.map((c, i) => (
                      <div key={i} className="flex gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-[#1c1c1f] flex items-center justify-center shrink-0 text-[10px] font-bold text-zinc-400 uppercase">
                          {c.author.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-1.5 mb-0.5">
                            <p className="text-[11px] font-semibold text-zinc-300 truncate">{c.author}</p>
                            <p className="text-[10px] text-zinc-600 shrink-0">{relDate(c.date)}</p>
                          </div>
                          <p className="text-xs text-zinc-400 leading-relaxed">{c.text}</p>
                          <p className="text-[10px] text-zinc-700 mt-1 truncate">{c.videoTitle}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-600 py-6 text-center">No comment data available.</p>
                )}
              </Card>
            </div>
          </div>}

          {/* Video Performance */}
          <Card title="Video Performance" subtitle={periodLabel}>
            {(() => {
              const pool = period === "alltime"
                ? { top: topPerformers, bottom: bottomPerformers }
                : (() => {
                    const sorted = [...periodVideos].sort((a, b) => b.viewCount - a.viewCount);
                    return { top: sorted.slice(0, 10), bottom: sorted.slice(-10).reverse() };
                  })();
              return (
                <div className="grid md:grid-cols-2 gap-6">
                  <VideoList label="Top performers" videos={pool.top} variant="top" />
                  <VideoList label="Lowest performers" videos={pool.bottom} variant="bottom" />
                </div>
              );
            })()}
          </Card>
        </div>
      )}

      {/* ── Tab: Channel Analysis ── */}
      {tab === "analysis" && (
        <div className="max-w-5xl mx-auto px-6 py-6 space-y-4 pb-24">

          {/* Synthesis (AI cross-layer) — replaces static TL;DR when available */}
          {sp?.synthesis ? (
            <ChannelSynthesisSection
              synthesis={sp.synthesis}
              totalVideos={sp.totalVideos}
              channelMedianViews={sp.channelMedianViews}
            />
          ) : sp && sp.tldr.length > 0 && (
            <div className="bg-[#111113] border border-[#1f1f22] rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-[#1f1f22]">
                <Sparkles className="w-3.5 h-3.5 text-[#ff3040]" />
                <p className="text-[10px] font-semibold text-[#ff3040] uppercase tracking-wider">What Works on Your Channel</p>
                <span className="ml-auto text-[10px] text-zinc-600 font-mono">{sp.totalVideos} videos · median {fmt(sp.channelMedianViews)}</span>
              </div>
              <div className="p-5 space-y-3">
                {sp.tldr.map((bullet, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="text-[#ff3040] font-mono text-xs shrink-0 mt-0.5">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-200 leading-snug">{bullet.text}</p>
                      <p className="text-[10px] text-zinc-600 mt-0.5 font-mono">{bullet.evidence}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Title Categories */}
          {sp ? (
            sp.titleCategories.length > 0 && (
              <div className="bg-[#111113] border border-[#1f1f22] rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-4 border-b border-[#1f1f22]">
                  <Type className="w-3.5 h-3.5 text-violet-400" />
                  <p className="text-[10px] font-semibold text-violet-400 uppercase tracking-wider">Title Categories</p>
                  <span className="ml-auto text-[10px] text-zinc-600 font-mono">× = category median ÷ channel median</span>
                </div>
                <div className="p-5">
                  <div className="space-y-2">
                    {[...sp.titleCategories].sort((a, b) => b.viewMultiplier - a.viewMultiplier).map((cat) => (
                      <div key={cat.key} className="flex items-center gap-3 bg-[#0d0d0f] rounded-lg px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-[12px] font-medium text-zinc-300 truncate">{cat.name}</p>
                            {cat.smallSample && !cat.lowConfidence && (
                              <span className="text-[9px] text-amber-600 bg-amber-900/20 px-1.5 py-0.5 rounded shrink-0">small sample</span>
                            )}
                            {cat.lowConfidence && (
                              <span className="text-[9px] text-amber-600 bg-amber-900/20 px-1.5 py-0.5 rounded shrink-0">low confidence</span>
                            )}
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            {cat.exampleTitles.slice(0, 2).map((t, ei) => (
                              <span key={ei} className="text-[10px] text-zinc-600 italic truncate max-w-[260px]">&ldquo;{t}&rdquo;</span>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <p className="text-[10px] text-zinc-600">n={cat.n}</p>
                            <p className="text-[11px] text-zinc-400">{fmt(cat.medianViews)}</p>
                          </div>
                          <div className={`px-2.5 py-1 rounded-lg border text-sm font-bold tabular-nums ${mBg(cat.viewMultiplier)} ${mColor(cat.viewMultiplier)}`}>
                            {cat.viewMultiplier.toFixed(1)}×
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-zinc-700 mt-3">× = category median ÷ channel median. Low confidence (dim) = &lt;3 videos. Small sample = &lt;10 videos — treat with caution.</p>
                </div>
              </div>
            )
          ) : (
            titleCategories.length > 0 && (
              <div className="bg-[#111113] border border-[#1f1f22] rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-4 border-b border-[#1f1f22]">
                  <Type className="w-3.5 h-3.5 text-violet-400" />
                  <p className="text-[10px] font-semibold text-violet-400 uppercase tracking-wider">Winning Titles</p>
                </div>
                <div className="p-5 space-y-4">
                  <p className="text-xs text-zinc-300 leading-relaxed">{buildTitlesInsight(titleCategories, topPerformers.length)}</p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {titleCategories.map((cat) => {
                      const accentClass: Record<string, string> = {
                        rose: "text-rose-400", amber: "text-amber-400", blue: "text-blue-400",
                        violet: "text-violet-400", teal: "text-teal-400",
                      };
                      const borderClass: Record<string, string> = {
                        rose: "border-rose-900/30", amber: "border-amber-900/30", blue: "border-blue-900/30",
                        violet: "border-violet-900/30", teal: "border-teal-900/30",
                      };
                      const accent = accentClass[cat.color] ?? "text-zinc-400";
                      const border = borderClass[cat.color] ?? "border-[#1a1a1d]";
                      return (
                        <div key={cat.key} className={`bg-[#0d0d0f] border ${border} rounded-lg p-3`}>
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <cat.Icon className={`w-3 h-3 ${accent} shrink-0`} />
                            <p className={`text-[10px] font-semibold ${accent} uppercase tracking-wider leading-none`}>{cat.name}</p>
                          </div>
                          <p className="text-[11px] text-zinc-400 leading-snug mb-1.5">{cat.description}</p>
                          <p className="text-[10px] text-zinc-600 font-mono mb-2.5 leading-snug">{cat.formula}</p>
                          <div className="border-t border-[#1a1a1d] pt-2 space-y-1">
                            <p className="text-[9px] text-zinc-700 uppercase tracking-wider mb-1">Top performers · {cat.examples.length}</p>
                            {cat.examples.map((ex, i) => (
                              <p key={i} className="text-[11px] text-zinc-500 italic leading-snug">&ldquo;{ex}&rdquo;</p>
                            ))}
                          </div>
                          {bottomPerformers.length > 0 && (
                            <div className="border-t border-[#1a1a1d] pt-2 mt-2 space-y-1">
                              <p className="text-[9px] text-zinc-700 uppercase tracking-wider mb-1">
                                Bottom performers · {cat.bottomExamples.length}{cat.bottomExamples.length === 0 ? " — pattern absent" : ""}
                              </p>
                              {cat.bottomExamples.length > 0 ? (
                                cat.bottomExamples.map((ex, i) => (
                                  <p key={i} className="text-[11px] text-zinc-700 italic leading-snug">&ldquo;{ex}&rdquo;</p>
                                ))
                              ) : (
                                <p className="text-[11px] text-zinc-700 italic">Not seen in bottom performers.</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )
          )}

          {/* Title Mechanics */}
          {sp && sp.titleMechanics.some((m) => !m.lowConfidence) && (
            <div className="bg-[#111113] border border-[#1f1f22] rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-[#1f1f22]">
                <Hash className="w-3.5 h-3.5 text-amber-500" />
                <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-wider">Title Mechanics</p>
              </div>
              <div className="p-5 space-y-2">
                {sp.titleMechanics.map((m) => (
                  <div
                    key={m.label}
                    className={`flex items-center gap-3 rounded-lg px-4 py-2.5 ${m.lowConfidence ? "opacity-40" : "bg-[#0d0d0f]"}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[12px] text-zinc-300">{m.label}</p>
                        {m.smallSample && !m.lowConfidence && (
                          <span className="text-[9px] text-amber-600 bg-amber-900/20 px-1.5 py-0.5 rounded">small sample</span>
                        )}
                        {m.lowConfidence && (
                          <span className="text-[9px] text-amber-600 bg-amber-900/20 px-1.5 py-0.5 rounded">low confidence</span>
                        )}
                      </div>
                      <p className="text-[10px] text-zinc-500 mt-0.5 leading-snug">
                        Titles {m.withPhrase} get <span className="font-semibold">{m.multiplier.toFixed(1)}×</span> the median views of those that don&apos;t
                        ({fmt(m.medianViewsWith)} vs {fmt(m.medianViewsWithout)} · {m.nWith} vs {m.nWithout} videos)
                      </p>
                    </div>
                    <div className={`px-2.5 py-1 rounded-lg border text-sm font-bold tabular-nums shrink-0 ${mBg(m.multiplier)} ${mColor(m.multiplier)}`}>
                      {m.multiplier.toFixed(1)}×
                    </div>
                  </div>
                ))}
                <p className="text-[10px] text-zinc-700 mt-1">× = median views with mechanic ÷ median views without. Low confidence (dim) = &lt;3 videos. Small sample = &lt;10 — treat with caution.</p>
              </div>
            </div>
          )}

          {/* Winning Lengths */}
          {sp ? (
            sp.durationBuckets.length > 0 && (
              <div className="bg-[#111113] border border-[#1f1f22] rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-4 border-b border-[#1f1f22]">
                  <Clock className="w-3.5 h-3.5 text-blue-400" />
                  <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider">Winning Lengths</p>
                  <span className="ml-auto text-[10px] text-zinc-600 font-mono">{sp.totalVideos} videos</span>
                </div>
                <div className="p-5 space-y-3">
                  {[...sp.durationBuckets].sort((a, b) => b.medianViews - a.medianViews).map((b) => (
                    <div key={b.label} className={b.lowConfidence ? "opacity-40" : ""}>
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-zinc-400 w-24 shrink-0">{b.label}</span>
                        <div className="flex-1 bg-[#1a1a1d] rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${mBar(b.viewMultiplier)}`}
                            style={{ width: `${Math.round((b.medianViews / maxDurAvg) * 100)}%` }}
                          />
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-zinc-600 font-mono w-8">n={b.n}</span>
                          <span className="text-[11px] text-zinc-400 w-14 text-right tabular-nums">{fmt(b.medianViews)}</span>
                          <span className={`text-[11px] font-semibold tabular-nums w-10 text-right ${mColor(b.viewMultiplier)}`}>{b.viewMultiplier.toFixed(1)}×</span>
                        </div>
                      </div>
                      {b.topPerformerCount > 0 && (
                        <p className="text-[10px] text-zinc-700 mt-0.5 ml-[108px]">{b.topPerformerCount} of your top-10 in this range</p>
                      )}
                      {b.lowConfidence && (
                        <p className="text-[9px] text-amber-700 ml-[108px]">low confidence</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          ) : (
            topDurations.length > 0 && (
              <div className="bg-[#111113] border border-[#1f1f22] rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-4 border-b border-[#1f1f22]">
                  <Clock className="w-3.5 h-3.5 text-blue-400" />
                  <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider">Winning Lengths</p>
                </div>
                <div className="p-5 space-y-4">
                  <p className="text-xs text-zinc-300 leading-relaxed">{buildLengthInsight(avgTopSec, topLengthRange, avgBotSec, botLengthRange, topDurations.length, botDurations.length)}</p>
                  <div className="pt-4 border-t border-[#1f1f22]">
                    <div className="grid sm:grid-cols-2 gap-6">
                      <div>
                        <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">Top performers · avg {fmtMins(avgTopSec)}</p>
                        <div className="space-y-1.5">
                          {topPerformers.slice(0, 8).map((v) => {
                            const secs = parseDurationSeconds(v.duration);
                            return secs > 0 ? (
                              <div key={v.id} className="flex items-baseline gap-2">
                                <span className="text-[10px] font-mono text-blue-400 shrink-0 w-7">{fmtMins(secs)}</span>
                                <p className="text-[11px] text-zinc-500 truncate">{v.title}</p>
                              </div>
                            ) : null;
                          })}
                        </div>
                      </div>
                      {botDurations.length > 0 && (
                        <div>
                          <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">Bottom performers · avg {fmtMins(avgBotSec)}</p>
                          <div className="space-y-1.5">
                            {bottomPerformers.slice(0, 8).map((v) => {
                              const secs = parseDurationSeconds(v.duration);
                              return secs > 0 ? (
                                <div key={v.id} className="flex items-baseline gap-2">
                                  <span className="text-[10px] font-mono text-zinc-600 shrink-0 w-7">{fmtMins(secs)}</span>
                                  <p className="text-[11px] text-zinc-500 truncate">{v.title}</p>
                                </div>
                              ) : null;
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          )}

          {/* Posting Timing */}
          {sp && (sp.postingTiming.byDayOfWeek.length > 0 || sp.postingTiming.byTimeOfDay.length > 0) && (
            <div className="bg-[#111113] border border-[#1f1f22] rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-[#1f1f22]">
                <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                <p className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wider">Posting Timing</p>
                {sp.postingTiming.lowConfidence && (
                  <span className="ml-auto text-[9px] text-amber-600 bg-amber-900/20 px-2 py-0.5 rounded">thin data — treat with caution</span>
                )}
              </div>
              <div className="p-5 grid sm:grid-cols-2 gap-8">
                <div>
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-3">By day of week — median views (UTC)</p>
                  <div className="space-y-1.5">
                    {[...sp.postingTiming.byDayOfWeek].sort((a, b) => b.medianViews - a.medianViews).map((d) => (
                      <div key={d.day} className={d.n < 3 ? "opacity-40" : ""}>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-zinc-500 w-20 shrink-0">{d.day}</span>
                          <div className="flex-1 bg-[#1a1a1d] rounded-full h-1.5 overflow-hidden">
                            <div className="h-full rounded-full bg-cyan-500" style={{ width: `${Math.round((d.medianViews / maxDayAvg) * 100)}%` }} />
                          </div>
                          <span className="text-[10px] text-zinc-500 shrink-0 w-14 text-right tabular-nums">{fmt(d.medianViews)}</span>
                          <span className="text-[10px] text-zinc-700 shrink-0 w-8 text-right font-mono">n={d.n}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-3">By time of day — median views (UTC)</p>
                  <div className="space-y-1.5">
                    {[...sp.postingTiming.byTimeOfDay].sort((a, b) => b.medianViews - a.medianViews).map((s) => (
                      <div key={s.slot} className={s.n < 3 ? "opacity-40" : ""}>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-zinc-500 w-32 shrink-0">{s.slot}</span>
                          <div className="flex-1 bg-[#1a1a1d] rounded-full h-1.5 overflow-hidden">
                            <div className="h-full rounded-full bg-cyan-500" style={{ width: `${Math.round((s.medianViews / maxSlotAvg) * 100)}%` }} />
                          </div>
                          <span className="text-[10px] text-zinc-500 shrink-0 w-14 text-right tabular-nums">{fmt(s.medianViews)}</span>
                          <span className="text-[10px] text-zinc-700 shrink-0 w-8 text-right font-mono">n={s.n}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-zinc-700 mt-3">Your local upload time may differ from UTC.</p>
                </div>
              </div>
            </div>
          )}

          {/* Retention */}
          {sp?.retentionAnalysis && (
            <RetentionSection
              analysis={sp.retentionAnalysis}
              videoOptions={[
                ...topPerformers.slice(0, 10).map((v) => ({ id: v.id, title: v.title, views: v.viewCount })),
                ...(sp.retentionAnalysis.bestRetainedVideo &&
                    !topPerformers.slice(0, 10).find((v) => v.id === sp.retentionAnalysis!.bestRetainedVideo!.videoId)
                  ? [{ id: sp.retentionAnalysis.bestRetainedVideo.videoId, title: sp.retentionAnalysis.bestRetainedVideo.title, views: sp.retentionAnalysis.bestRetainedVideo.views }]
                  : []),
              ]}
              onTurnIntoBrief={(prompt) => { setPlanInput(prompt); setTab("ideas"); }}
            />
          )}

          {/* Growth */}
          {sp?.growthAnalysis && (
            <GrowthSection
              analysis={sp.growthAnalysis}
              onTurnIntoBrief={(prompt) => { setPlanInput(prompt); setTab("ideas"); }}
            />
          )}

          {/* Audience */}
          {sp?.audienceAnalysis && (
            <AudienceSection
              analysis={sp.audienceAnalysis}
              commentIntel={analysis.commentIntel}
              onTurnIntoBrief={(prompt) => { setPlanInput(prompt); setTab("ideas"); }}
            />
          )}

          {/* Cadence */}
          {sp?.cadenceAnalysis && (
            <CadenceSection
              analysis={sp.cadenceAnalysis}
              onTurnIntoBrief={(prompt) => { setPlanInput(prompt); setTab("ideas"); }}
            />
          )}

          {/* Trajectory */}
          {sp?.trajectoryAnalysis && (
            <TrajectorySection
              analysis={sp.trajectoryAnalysis}
              snapshots={snapshots}
              onTurnIntoBrief={(prompt) => { setPlanInput(prompt); setTab("ideas"); }}
            />
          )}

          {/* Winning Hooks */}
          {(sp?.hookAnalysis || autopsy?.topPerformerPattern) && (
            <div className="bg-[#111113] border border-[#1f1f22] rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-[#1f1f22]">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-wider">Winning Hooks</p>
                {sp?.hookAnalysis && (
                  <span className="ml-auto text-[10px] text-zinc-600 font-mono">
                    from captions · {Math.round(sp.hookAnalysis.captionCoverage * 100)}% coverage
                  </span>
                )}
              </div>
              <div className="p-5 space-y-4">
                {sp?.hookAnalysis ? (
                  <HookAnalysisView hookAnalysis={sp.hookAnalysis} />
                ) : (
                  <>
                    <p className="text-xs text-zinc-300 leading-relaxed">{autopsy?.topPerformerPattern}</p>
                    {topPerformers.length > 0 && (
                      <div className="pt-4 border-t border-[#1f1f22]">
                        <div className="grid sm:grid-cols-2 gap-6">
                          <div>
                            <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">Top performers</p>
                            {hookClusters.length >= 2 ? (
                              <div className="space-y-4">
                                {hookClusters.map((cluster) => (
                                  <div key={cluster.label}>
                                    <p className="text-[9px] text-zinc-700 uppercase tracking-wider mb-1">{cluster.label}</p>
                                    <div className="space-y-1">
                                      {cluster.examples.map((title, i) => (
                                        <p key={i} className="text-[11px] text-zinc-500 italic leading-snug">&ldquo;{title}&rdquo;</p>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="space-y-1">
                                {topPerformers.slice(0, 8).map((v) => (
                                  <p key={v.id} className="text-[11px] text-zinc-500 italic leading-snug">&ldquo;{v.title}&rdquo;</p>
                                ))}
                              </div>
                            )}
                          </div>
                          {bottomPerformers.length > 0 && (
                            <div>
                              <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">Bottom performers</p>
                              {bottomHookClusters.length >= 2 ? (
                                <div className="space-y-4">
                                  {bottomHookClusters.map((cluster) => (
                                    <div key={cluster.label}>
                                      <p className="text-[9px] text-zinc-700 uppercase tracking-wider mb-1">{cluster.label}</p>
                                      <div className="space-y-1">
                                        {cluster.examples.map((title, i) => (
                                          <p key={i} className="text-[11px] text-zinc-700 italic leading-snug">&ldquo;{title}&rdquo;</p>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  {bottomPerformers.slice(0, 8).map((v) => (
                                    <p key={v.id} className="text-[11px] text-zinc-700 italic leading-snug">&ldquo;{v.title}&rdquo;</p>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Channel Autopsy */}
          {autopsy ? (
            <Card title="Channel Autopsy">
              <div className="space-y-4">
                <div className="bg-[#0d0d0f] rounded-lg px-4 py-3.5">
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1.5">Overall diagnosis</p>
                  <p className="text-sm text-zinc-200 leading-relaxed">{autopsy.overallTrend}</p>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="bg-[#0f1a14] border border-emerald-900/30 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                      <p className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wider">What&apos;s working</p>
                    </div>
                    <ul className="space-y-2">
                      {autopsy.whatIsWorking.map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                          <span className="text-emerald-600 shrink-0 mt-0.5">✓</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="bg-[#1a0f0f] border border-red-900/30 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingDown className="w-3.5 h-3.5 text-red-500" />
                      <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wider">What isn&apos;t working</p>
                    </div>
                    <ul className="space-y-2">
                      {autopsy.whatIsNotWorking.map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                          <span className="text-red-600 shrink-0 mt-0.5">✗</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="bg-[#0d0d0f] rounded-lg px-4 py-3.5">
                    <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">Audience insight</p>
                    <p className="text-xs text-zinc-300 leading-relaxed">{autopsy.audienceInsights}</p>
                  </div>
                  <div className="bg-[#0d0d0f] rounded-lg px-4 py-3.5">
                    <div className="flex items-center gap-2 mb-2">
                      <Target className="w-3 h-3 text-[#ff3040]" />
                      <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Actions to take now</p>
                    </div>
                    <ul className="space-y-1.5">
                      {autopsy.actionableAdvice.map((advice, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                          <span className="text-[#ff3040] shrink-0 font-mono">{i + 1}.</span>
                          {advice}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </Card>
          ) : (
            <div className="flex items-center justify-center py-24 text-zinc-600 text-sm">
              No analysis data available yet.
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Planning Content ── */}
      {tab === "ideas" && (
        <div className="flex flex-col h-[calc(100vh-116px)]">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5 max-w-3xl mx-auto w-full">
            {planMsgs.filter((m) => !m.hidden).length === 0 && planLoading && (
              <div className="flex gap-3 items-start">
                <div className="w-7 h-7 bg-[#1c1c1f] rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#ff3040]" />
                </div>
                <div className="bg-[#111113] border border-[#27272a] rounded-2xl rounded-tl-sm px-4 py-3">
                  <Loader2 className="w-3.5 h-3.5 text-zinc-500 animate-spin" />
                </div>
              </div>
            )}

            {planMsgs.filter((m) => !m.hidden).map((msg, i) => {
              const visibleIdx = i;
              const globalIdx = planMsgs.indexOf(msg);
              const hasIdeas = msg.role === "assistant" && extractIdeas(msg.content).length > 0;
              const saveStatus = planSaveStatus.get(globalIdx);
              return (
                <div key={globalIdx} className={`flex gap-3 items-start ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                  {msg.role === "assistant" && (
                    <div className="w-7 h-7 bg-[#1c1c1f] rounded-full flex items-center justify-center shrink-0 mt-0.5">
                      <Sparkles className="w-3.5 h-3.5 text-[#ff3040]" />
                    </div>
                  )}
                  <div className="flex flex-col gap-2 max-w-[85%]">
                    <div
                      className={`text-[13px] leading-relaxed whitespace-pre-wrap rounded-2xl px-4 py-3 ${
                        msg.role === "user"
                          ? "bg-[#ff3040] text-white rounded-tr-sm"
                          : "bg-[#111113] text-zinc-200 border border-[#27272a] rounded-tl-sm"
                      }`}
                    >
                      {msg.content || (
                        msg.role === "assistant" && planLoading && visibleIdx === planMsgs.filter((m) => !m.hidden).length - 1
                          ? <Loader2 className="w-3.5 h-3.5 text-zinc-500 animate-spin" />
                          : null
                      )}
                    </div>
                    {hasIdeas && !planLoading && (
                      <button
                        onClick={() => {
                          if (saveStatus !== "saving" && saveStatus !== "saved") {
                            saveIdeasFromMsg(globalIdx, msg.content);
                          }
                        }}
                        disabled={saveStatus === "saving" || saveStatus === "saved"}
                        className={`self-start flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border transition-colors ${
                          saveStatus === "saved"
                            ? "text-emerald-400 border-emerald-800/40 bg-emerald-950/20 cursor-default"
                            : saveStatus === "saving"
                            ? "text-zinc-600 border-[#27272a] cursor-default"
                            : saveStatus === "error"
                            ? "text-red-400 border-red-900/40 hover:bg-red-950/20"
                            : "text-zinc-500 border-[#27272a] hover:text-zinc-300 hover:border-[#3f3f45] hover:bg-[#111113]"
                        }`}
                      >
                        {saveStatus === "saving" ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <BookmarkPlus className="w-3 h-3" />
                        )}
                        {saveStatus === "saved"
                          ? "Saved to Channel Ideas"
                          : saveStatus === "saving"
                          ? "Saving…"
                          : saveStatus === "error"
                          ? "Failed — retry"
                          : `Save idea${extractIdeas(msg.content).length > 1 ? "s" : ""}`}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={planEndRef} />
          </div>

          {/* Input bar */}
          <div className="shrink-0 border-t border-[#1f1f22] bg-[#09090b] px-6 py-3">
            <div className="max-w-3xl mx-auto flex items-end gap-2">
              <div className="flex-1 bg-[#111113] border border-[#27272a] rounded-xl px-3.5 py-2.5 focus-within:border-[#ff3040]/40 transition-colors">
                <textarea
                  value={planInput}
                  onChange={(e) => setPlanInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handlePlanSend();
                    }
                  }}
                  placeholder="Tell me what you want to make…"
                  rows={1}
                  disabled={planLoading}
                  className="w-full bg-transparent text-[13px] text-white placeholder-zinc-600 focus:outline-none resize-none min-h-[20px] max-h-[120px] disabled:opacity-40"
                  style={{ fieldSizing: "content" } as React.CSSProperties}
                />
              </div>
              <button
                onClick={handlePlanSend}
                disabled={!planInput.trim() || planLoading}
                className="w-8 h-8 bg-[#ff3040] hover:bg-[#e02030] disabled:opacity-30 disabled:cursor-not-allowed rounded-lg flex items-center justify-center shrink-0 transition-colors"
              >
                {planLoading ? (
                  <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5 text-white" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Channel Ideas ── */}
      {tab === "channel-ideas" && <SavedIdeasBoard platform="youtube" />}
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#111113] border border-[#1f1f22] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1f1f22]">
        <p className="text-sm font-semibold text-white">{title}</p>
        {subtitle && <p className="text-[11px] text-zinc-600">{subtitle}</p>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function StatBlock({
  label,
  value,
  delta,
  sub,
}: {
  label: string;
  value: string;
  delta?: number | null;
  sub?: string;
}) {
  return (
    <div className="flex-1 px-5 py-4 min-w-0">
      <p className="text-[11px] text-zinc-500 mb-2 truncate">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-white leading-none">{value}</p>
      {delta != null ? (
        <p className={`text-[11px] mt-1.5 font-medium ${delta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
          {delta >= 0 ? "+" : ""}{fmt(Math.abs(delta))} {sub}
        </p>
      ) : sub ? (
        <p className="text-[10px] text-zinc-600 mt-1.5 leading-tight">{sub}</p>
      ) : null}
    </div>
  );
}

const HOOK_TYPE_LABEL: Record<HookEntry["hookType"], string> = {
  "cold-open-story": "Cold-open story",
  "bold-claim": "Bold claim",
  "question": "Question",
  "direct-address": "Direct address",
  "other": "Other",
};

function HookAnalysisView({ hookAnalysis }: { hookAnalysis: HookAnalysis }) {
  if (!hookAnalysis.hasEnoughData) {
    return (
      <p className="text-xs text-zinc-500 leading-relaxed">
        Caption coverage too thin for hook analysis ({Math.round(hookAnalysis.captionCoverage * 100)}% of top/bottom performers have captions fetched).
        Re-run analysis after more videos are transcribed, or captions become available.
      </p>
    );
  }
  return (
    <div className="grid sm:grid-cols-2 gap-6">
      <div>
        <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-3">Top performers · spoken hook</p>
        <div className="space-y-3">
          {hookAnalysis.topHooks.map((hook) => (
            <div key={hook.videoId}>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[9px] text-amber-600 bg-amber-900/20 px-1.5 py-0.5 rounded font-medium">
                  {HOOK_TYPE_LABEL[hook.hookType]}
                </span>
                <span className="text-[10px] text-zinc-700 tabular-nums">{fmt(hook.views)}</span>
              </div>
              <p className="text-[11px] text-zinc-400 italic leading-snug">&ldquo;{hook.hookText}&rdquo;</p>
              <p className="text-[10px] text-zinc-700 truncate mt-0.5">{hook.title}</p>
            </div>
          ))}
        </div>
      </div>
      {hookAnalysis.bottomHooks.length > 0 && (
        <div>
          <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-3">Bottom performers · spoken hook</p>
          <div className="space-y-3">
            {hookAnalysis.bottomHooks.map((hook) => (
              <div key={hook.videoId}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[9px] text-zinc-700 bg-zinc-800/40 px-1.5 py-0.5 rounded font-medium">
                    {HOOK_TYPE_LABEL[hook.hookType]}
                  </span>
                  <span className="text-[10px] text-zinc-700 tabular-nums">{fmt(hook.views)}</span>
                </div>
                <p className="text-[11px] text-zinc-600 italic leading-snug">&ldquo;{hook.hookText}&rdquo;</p>
                <p className="text-[10px] text-zinc-700 truncate mt-0.5">{hook.title}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function VideoList({
  label,
  videos,
  variant,
}: {
  label: string;
  videos: VideoWithScore[];
  variant: "top" | "bottom";
}) {
  const isTop = variant === "top";
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {isTop ? (
          <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
        ) : (
          <TrendingDown className="w-3.5 h-3.5 text-red-500" />
        )}
        <p className={`text-xs font-semibold ${isTop ? "text-emerald-500" : "text-red-500"}`}>{label}</p>
      </div>
      <div className="space-y-1.5">
        {videos.map((v, i) => (
          <div
            key={v.id}
            className="flex items-center gap-3 bg-[#0d0d0f] rounded-lg px-3.5 py-3"
          >
            <span className="text-[11px] font-mono text-zinc-600 w-4 shrink-0">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate leading-tight">{v.title}</p>
              <p className="text-[10px] text-zinc-600 mt-0.5">{v.publishedAt.slice(0, 10)}</p>
            </div>
            <div className="text-right shrink-0">
              <div className="flex items-center gap-1 text-sm font-bold text-white">
                <Eye className="w-3 h-3 text-zinc-600" />
                {fmt(v.viewCount)}
              </div>
              <div className="flex items-center gap-2 mt-0.5 justify-end">
                <span className="flex items-center gap-0.5 text-[10px] text-zinc-500">
                  <ThumbsUp className="w-2.5 h-2.5" />{fmt(v.likeCount)}
                </span>
                <span className="flex items-center gap-0.5 text-[10px] text-zinc-500">
                  <MessageSquare className="w-2.5 h-2.5" />{fmt(v.commentCount)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
