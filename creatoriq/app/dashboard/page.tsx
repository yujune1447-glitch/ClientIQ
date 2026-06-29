import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  Zap, TrendingUp, TrendingDown, PlayCircle, Eye, ThumbsUp,
  MessageSquare, Lightbulb, Target, BarChart2, RefreshCw, Bell,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase-admin";
import { MarkRead } from "@/app/components/MarkRead";
import { GrowthSection } from "@/app/components/GrowthSection";
import type { ChannelSummary, ContentBrief, ContentAutopsy, VideoWithScore, ChannelSnapshot } from "@/types";

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const cookieStore = await cookies();
  const userId = cookieStore.get("user_id")?.value;

  if (!userId) redirect("/");

  if (!id) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-500 mb-4">No analysis found.</p>
          <Link href="/" className="text-sm text-[#ff3040] hover:underline">← Back to home</Link>
        </div>
      </div>
    );
  }

  const supabase = createAdminClient();
  const [{ data: analysis }, { data: snapshots }] = await Promise.all([
    supabase.from("analyses").select("*").eq("id", id).eq("user_id", userId).single(),
    supabase.from("channel_snapshots").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
  ]);

  if (!analysis) redirect("/");

  const summary = analysis.summary as ChannelSummary;
  const brief = analysis.brief as ContentBrief;
  const autopsy = analysis.autopsy as ContentAutopsy;
  const { channel, averages, topPerformers, bottomPerformers } = summary;
  const isUnread = analysis.is_unread === true;
  const isScheduled = analysis.generated_by === "scheduled";
  const channelSnapshots = (snapshots ?? []) as ChannelSnapshot[];

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {isUnread && <MarkRead analysisId={id} />}
      {isUnread && isScheduled && (
        <div className="bg-[#1a1014] border-b border-[#ff3040]/30 px-6 py-2.5 flex items-center justify-center gap-2">
          <Bell className="w-3.5 h-3.5 text-[#ff3040]" />
          <p className="text-xs text-zinc-300">Your weekly brief was automatically generated. New intelligence every Monday.</p>
        </div>
      )}
      <nav className="border-b border-[#1f1f22] px-6 py-4 sticky top-0 bg-[#09090b]/95 backdrop-blur-sm z-10">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-[#ff3040] rounded-md flex items-center justify-center">
              <Zap className="w-4 h-4 text-white fill-white" />
            </div>
            <span className="font-semibold text-[15px] tracking-tight">CreatorIQ</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/niche" className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />
              Re-analyse
            </Link>
            <Link href="/" className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">← Home</Link>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8">
        {/* Channel header */}
        <div className="flex items-center gap-4">
          {channel.thumbnail ? (
            <img src={channel.thumbnail} alt={channel.title} className="w-12 h-12 rounded-full object-cover" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-[#ff3040] flex items-center justify-center shrink-0">
              <PlayCircle className="w-6 h-6 text-white" />
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold">{channel.title}</h1>
            <p className="text-sm text-zinc-500">
              {fmt(summary.totalVideosAnalysed)} videos analysed · {new Date(analysis.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className="ml-auto flex gap-6">
            {[
              { label: "Subscribers", value: fmt(channel.subscriberCount) },
              { label: "Avg views", value: fmt(averages.views) },
              { label: "Avg CTR", value: `${averages.ctr}%` },
            ].map((s) => (
              <div key={s.label} className="text-right hidden sm:block">
                <p className="text-lg font-bold tabular-nums">{s.value}</p>
                <p className="text-[11px] text-zinc-600">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Content Brief */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="w-4 h-4 text-[#ff3040]" />
            <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-400">
              This Week&apos;s Content Brief
            </h2>
          </div>
          <div className="bg-[#111113] border border-[#27272a] rounded-xl p-6 space-y-6">
            <div>
              <p className="text-xs text-zinc-600 uppercase tracking-wider mb-2">Make this video</p>
              <h3 className="text-2xl font-bold tracking-tight leading-tight">&ldquo;{brief.weeklyIdea}&rdquo;</h3>
            </div>

            <div className="h-px bg-[#1f1f22]" />

            <div>
              <p className="text-xs text-zinc-600 uppercase tracking-wider mb-2">Why this works</p>
              <p className="text-sm text-zinc-300 leading-relaxed">{brief.rationale}</p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-[#1a1014] border border-[#ff3040]/20 rounded-lg p-4">
                <p className="text-xs text-[#ff3040] uppercase tracking-wider mb-2">Opening hook</p>
                <p className="text-sm text-zinc-200 italic leading-relaxed">{brief.hook}</p>
              </div>
              <div className="bg-[#0f1114] border border-[#1f1f22] rounded-lg p-4">
                <p className="text-xs text-zinc-600 uppercase tracking-wider mb-2">Format</p>
                <p className="text-sm text-zinc-300 leading-relaxed">{brief.format}</p>
              </div>
            </div>

            <div>
              <p className="text-xs text-zinc-600 uppercase tracking-wider mb-3">Key talking points</p>
              <ul className="space-y-2">
                {brief.keyTalkingPoints.map((point, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-zinc-300">
                    <span className="text-[#ff3040] font-mono text-xs mt-0.5 shrink-0">{i + 1}.</span>
                    {point}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-xs text-zinc-600 uppercase tracking-wider mb-3">Title options</p>
              <div className="space-y-2">
                {brief.titleOptions.map((title, i) => (
                  <div
                    key={i}
                    className={`px-4 py-2.5 rounded-lg border text-sm ${
                      i === 0
                        ? "border-[#ff3040]/40 bg-[#1a1014] text-white font-medium"
                        : "border-[#1f1f22] text-zinc-400"
                    }`}
                  >
                    {i === 0 && (
                      <span className="text-[10px] text-[#ff3040] font-semibold mr-2 uppercase">Recommended</span>
                    )}
                    {title}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[#0f1114] border border-[#1f1f22] rounded-lg p-4">
              <p className="text-xs text-zinc-600 uppercase tracking-wider mb-2">Thumbnail direction</p>
              <p className="text-sm text-zinc-300 leading-relaxed">{brief.thumbnailDirection}</p>
            </div>
          </div>
        </section>

        {/* Channel Autopsy */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 className="w-4 h-4 text-[#ff3040]" />
            <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-400">Channel Autopsy</h2>
          </div>

          <div className="bg-[#111113] border border-[#27272a] rounded-xl p-6 mb-4">
            <p className="text-xs text-zinc-600 uppercase tracking-wider mb-2">Overall diagnosis</p>
            <p className="text-base text-zinc-200 leading-relaxed">{autopsy.overallTrend}</p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <div className="bg-[#0f1a14] border border-emerald-900/40 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                <p className="text-xs font-semibold text-emerald-500 uppercase tracking-wider">What&apos;s working</p>
              </div>
              <ul className="space-y-2.5">
                {autopsy.whatIsWorking.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                    <span className="text-emerald-600 shrink-0 mt-0.5">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-[#1a0f0f] border border-red-900/40 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingDown className="w-4 h-4 text-red-500" />
                <p className="text-xs font-semibold text-red-500 uppercase tracking-wider">What isn&apos;t working</p>
              </div>
              <ul className="space-y-2.5">
                {autopsy.whatIsNotWorking.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                    <span className="text-red-600 shrink-0 mt-0.5">✗</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-[#111113] border border-[#1f1f22] rounded-xl p-5">
              <p className="text-xs text-zinc-600 uppercase tracking-wider mb-3">Audience insight</p>
              <p className="text-sm text-zinc-300 leading-relaxed">{autopsy.audienceInsights}</p>
            </div>
            <div className="bg-[#111113] border border-[#1f1f22] rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-3.5 h-3.5 text-[#ff3040]" />
                <p className="text-xs text-zinc-600 uppercase tracking-wider">Actions to take now</p>
              </div>
              <ul className="space-y-2">
                {autopsy.actionableAdvice.map((advice, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                    <span className="text-[#ff3040] shrink-0 mt-0.5 text-xs font-mono">{i + 1}.</span>
                    {advice}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Video performance */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 className="w-4 h-4 text-[#ff3040]" />
            <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-400">Video Performance</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <VideoList label="Top performers" videos={topPerformers} variant="top" />
            <VideoList label="Bottom performers" videos={bottomPerformers} variant="bottom" />
          </div>
        </section>

        {/* Growth tracking */}
        <GrowthSection snapshots={channelSnapshots} />

        {/* Footer stats */}
        <div className="border-t border-[#1f1f22] pt-6 flex flex-wrap gap-6 pb-10">
          {[
            { icon: <Eye className="w-3.5 h-3.5" />, label: "Avg views", value: fmt(averages.views) },
            { icon: <ThumbsUp className="w-3.5 h-3.5" />, label: "Avg likes", value: fmt(averages.likes) },
            { icon: <MessageSquare className="w-3.5 h-3.5" />, label: "Avg comments", value: fmt(averages.comments) },
            { icon: <BarChart2 className="w-3.5 h-3.5" />, label: "Videos analysed", value: fmt(summary.totalVideosAnalysed) },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-2 text-zinc-500">
              {s.icon}
              <span className="text-xs">{s.label}:</span>
              <span className="text-xs font-semibold text-zinc-300">{s.value}</span>
            </div>
          ))}
        </div>
      </main>
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
      <div className="space-y-2">
        {videos.map((v, i) => (
          <div key={v.id} className="flex items-center gap-3 bg-[#111113] border border-[#1f1f22] rounded-lg px-4 py-3">
            <span className="text-xs font-mono text-zinc-600 w-5 shrink-0">#{i + 1}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{v.title}</p>
              <p className="text-xs text-zinc-600">{v.publishedAt.slice(0, 10)}</p>
            </div>
            <div className="text-right shrink-0">
              <div className="flex items-center gap-1 text-sm font-bold text-white">
                <Eye className="w-3 h-3 text-zinc-600" />
                {fmt(v.viewCount)}
              </div>
              <p className={`text-[11px] ${isTop ? "text-emerald-500" : "text-red-500"}`}>
                Score {v.performanceScore}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
