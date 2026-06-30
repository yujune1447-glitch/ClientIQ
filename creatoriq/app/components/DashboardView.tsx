"use client";

import { TrendingUp, TrendingDown, Users, Eye, BarChart2, Lightbulb, PlayCircle, Camera, Music2 } from "lucide-react";
import { GrowthSection } from "@/app/components/GrowthSection";
import type { AnalysisData } from "@/app/components/AnalysisContent";
import type { ChannelSnapshot } from "@/types";

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

interface Props {
  analysis: AnalysisData | null;
  snapshots: ChannelSnapshot[];
  ytConn: { channelTitle: string; channelThumbnail: string | null; channelHandle: string | null } | null;
  igConn: { username: string } | null;
  ttConn: { displayName: string } | null;
  onNavigate: (platform: "youtube" | "instagram" | "tiktok") => void;
}

function StatCard({ label, value, sub, icon, accent }: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="bg-[#111113] border border-[#27272a] rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3 text-zinc-600">
        {icon}
        <p className="text-[11px] uppercase tracking-wider font-medium">{label}</p>
      </div>
      <p className={`text-2xl font-bold tabular-nums ${accent ?? "text-white"}`}>{value}</p>
      <p className="text-[11px] text-zinc-600 mt-1">{sub}</p>
    </div>
  );
}

export function DashboardView({ analysis, snapshots, ytConn, igConn, ttConn, onNavigate }: Props) {
  if (!ytConn && !analysis) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-sm px-6">
          <div className="w-12 h-12 bg-[#1c1c1f] border border-[#27272a] rounded-xl flex items-center justify-center mx-auto mb-4">
            <PlayCircle className="w-6 h-6 text-zinc-600" />
          </div>
          <h2 className="text-lg font-semibold mb-2">Connect YouTube to get started</h2>
          <p className="text-sm text-zinc-500 mb-6">Connect your YouTube channel to see your stats and AI-powered content briefs.</p>
          <a
            href="/api/auth/youtube"
            className="inline-flex items-center gap-2 bg-[#ff3040] hover:bg-[#e02030] text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
          >
            <PlayCircle className="w-4 h-4" />
            Connect YouTube
          </a>
        </div>
      </div>
    );
  }

  const { summary, brief, igSummary, tikTokSummary } = analysis ?? {
    summary: null, brief: null, igSummary: null, tikTokSummary: null,
  };

  const ytSubs = summary?.channel.subscriberCount ?? 0;
  const igFollowers = igSummary?.followerCount ?? 0;
  const ttFollowers = tikTokSummary?.followerCount ?? 0;
  const totalFollowers = ytSubs + igFollowers + ttFollowers;

  let weeklyGrowthPct: number | null = null;
  if (snapshots.length >= 2) {
    const sorted = [...snapshots].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const latest = sorted[sorted.length - 1].subscriber_count;
    const prev = sorted[sorted.length - 2].subscriber_count;
    if (prev > 0) weeklyGrowthPct = ((latest - prev) / prev) * 100;
  }

  const avgEngagementRate = (() => {
    const rates: number[] = [];
    if (summary && summary.averages.views > 0) rates.push((summary.averages.likes / summary.averages.views) * 100);
    if (igSummary) rates.push(igSummary.averages.engagementRate);
    if (tikTokSummary) rates.push(tikTokSummary.averages.engagementRate);
    if (rates.length === 0) return null;
    return rates.reduce((a, b) => a + b, 0) / rates.length;
  })();

  const topVideo = summary?.topPerformers[0];
  const platforms = [ytConn ? "YouTube" : null, igConn ? "Instagram" : null, ttConn ? "TikTok" : null].filter(Boolean).join(" · ");

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
      <div>
        <h1 className="text-xl font-bold">Overview</h1>
        <p className="text-sm text-zinc-500 mt-0.5">{platforms || "No platforms connected"}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Followers"
          value={totalFollowers > 0 ? fmt(totalFollowers) : "—"}
          sub="across all platforms"
          icon={<Users className="w-4 h-4" />}
        />
        <StatCard
          label="Weekly Growth"
          value={weeklyGrowthPct !== null ? `${weeklyGrowthPct > 0 ? "+" : ""}${weeklyGrowthPct.toFixed(1)}%` : "—"}
          sub="vs last snapshot"
          icon={weeklyGrowthPct !== null && weeklyGrowthPct >= 0
            ? <TrendingUp className="w-4 h-4 text-emerald-500" />
            : <TrendingDown className="w-4 h-4 text-red-500" />}
          accent={weeklyGrowthPct !== null ? (weeklyGrowthPct >= 0 ? "text-emerald-400" : "text-red-400") : undefined}
        />
        <StatCard
          label="Total Views"
          value={summary ? fmt(summary.channel.totalViews) : "—"}
          sub="YouTube lifetime"
          icon={<Eye className="w-4 h-4" />}
        />
        <StatCard
          label="Avg Engagement"
          value={avgEngagementRate !== null ? `${avgEngagementRate.toFixed(1)}%` : "—"}
          sub="across platforms"
          icon={<BarChart2 className="w-4 h-4" />}
        />
      </div>

      <section>
        <p className="text-[11px] text-zinc-600 uppercase tracking-widest font-medium mb-3">Platforms</p>
        <div className="grid md:grid-cols-3 gap-3">
          {ytConn ? (
            <button
              onClick={() => onNavigate("youtube")}
              className="bg-[#111113] border border-[#27272a] hover:border-[#ff3040]/40 rounded-xl p-5 text-left transition-colors group"
            >
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-7 h-7 rounded-full bg-[#ff3040]/10 flex items-center justify-center shrink-0">
                  <PlayCircle className="w-3.5 h-3.5 text-[#ff3040]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold group-hover:text-white transition-colors">YouTube</p>
                  <p className="text-[11px] text-zinc-600 truncate">{ytConn.channelHandle ?? ytConn.channelTitle}</p>
                </div>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              </div>
              {summary ? (
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {[
                    { v: fmt(ytSubs), l: "Subscribers" },
                    { v: fmt(summary.averages.views), l: "Avg views" },
                    { v: `${summary.averages.ctr}%`, l: "Avg CTR" },
                    { v: fmt(summary.totalVideosAnalysed), l: "Videos" },
                  ].map(({ v, l }) => (
                    <div key={l}>
                      <p className="text-base font-bold tabular-nums">{v}</p>
                      <p className="text-[11px] text-zinc-600">{l}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-600">No analysis data yet</p>
              )}
            </button>
          ) : (
            <a
              href="/api/auth/youtube"
              className="bg-[#111113] border border-dashed border-[#27272a] hover:border-[#ff3040]/40 rounded-xl p-5 flex flex-col items-center justify-center gap-3 transition-colors group min-h-[140px]"
            >
              <div className="w-7 h-7 rounded-full bg-[#ff3040]/10 flex items-center justify-center">
                <PlayCircle className="w-3.5 h-3.5 text-zinc-600 group-hover:text-[#ff3040] transition-colors" />
              </div>
              <p className="text-sm text-zinc-500 group-hover:text-white transition-colors">Connect YouTube</p>
            </a>
          )}

          {igConn ? (
            <button
              onClick={() => onNavigate("instagram")}
              className="bg-[#111113] border border-[#27272a] hover:border-pink-500/40 rounded-xl p-5 text-left transition-colors group"
            >
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-600/20 to-pink-500/20 flex items-center justify-center shrink-0">
                  <Camera className="w-3.5 h-3.5 text-pink-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold group-hover:text-white transition-colors">Instagram</p>
                  <p className="text-[11px] text-zinc-600">@{igConn.username}</p>
                </div>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              </div>
              {igSummary ? (
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {[
                    { v: fmt(igSummary.followerCount), l: "Followers" },
                    { v: `${igSummary.averages.engagementRate}%`, l: "Engagement" },
                    { v: fmt(igSummary.averages.reach), l: "Avg reach" },
                    { v: fmt(igSummary.averages.likes), l: "Avg likes" },
                  ].map(({ v, l }) => (
                    <div key={l}>
                      <p className="text-base font-bold tabular-nums">{v}</p>
                      <p className="text-[11px] text-zinc-600">{l}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-600">Run analysis to see stats</p>
              )}
            </button>
          ) : (
            <a
              href="/api/auth/instagram"
              className="bg-[#111113] border border-dashed border-[#27272a] hover:border-pink-500/40 rounded-xl p-5 flex flex-col items-center justify-center gap-3 transition-colors group min-h-[140px]"
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-600/10 to-pink-500/10 flex items-center justify-center">
                <Camera className="w-3.5 h-3.5 text-zinc-600 group-hover:text-pink-400 transition-colors" />
              </div>
              <p className="text-sm text-zinc-500 group-hover:text-white transition-colors">Connect Instagram</p>
            </a>
          )}

          {ttConn ? (
            <button
              onClick={() => onNavigate("tiktok")}
              className="bg-[#111113] border border-[#27272a] hover:border-cyan-500/40 rounded-xl p-5 text-left transition-colors group"
            >
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500/20 to-[#EE1D52]/20 flex items-center justify-center shrink-0">
                  <Music2 className="w-3.5 h-3.5 text-cyan-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold group-hover:text-white transition-colors">TikTok</p>
                  <p className="text-[11px] text-zinc-600">{ttConn.displayName}</p>
                </div>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              </div>
              {tikTokSummary ? (
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {[
                    { v: fmt(tikTokSummary.followerCount), l: "Followers" },
                    { v: `${tikTokSummary.averages.engagementRate}%`, l: "Engagement" },
                    { v: fmt(tikTokSummary.averages.views), l: "Avg views" },
                    { v: fmt(tikTokSummary.videoCount), l: "Videos" },
                  ].map(({ v, l }) => (
                    <div key={l}>
                      <p className="text-base font-bold tabular-nums">{v}</p>
                      <p className="text-[11px] text-zinc-600">{l}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-600">Run analysis to see stats</p>
              )}
            </button>
          ) : (
            <a
              href="/api/auth/tiktok"
              className="bg-[#111113] border border-dashed border-[#27272a] hover:border-cyan-500/40 rounded-xl p-5 flex flex-col items-center justify-center gap-3 transition-colors group min-h-[140px]"
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500/10 to-[#EE1D52]/10 flex items-center justify-center">
                <Music2 className="w-3.5 h-3.5 text-zinc-600 group-hover:text-cyan-400 transition-colors" />
              </div>
              <p className="text-sm text-zinc-500 group-hover:text-white transition-colors">Connect TikTok</p>
            </a>
          )}
        </div>
      </section>

      {snapshots.length > 0 && <GrowthSection snapshots={snapshots} />}

      {topVideo && (
        <section>
          <p className="text-[11px] text-zinc-600 uppercase tracking-widest font-medium mb-3">Trending Content</p>
          <button
            onClick={() => onNavigate("youtube")}
            className="w-full bg-[#111113] border border-[#27272a] hover:border-[#ff3040]/30 rounded-xl p-5 flex items-center gap-4 transition-colors group text-left"
          >
            <div className="w-9 h-9 rounded-lg bg-[#ff3040]/10 flex items-center justify-center shrink-0">
              <PlayCircle className="w-4 h-4 text-[#ff3040]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate group-hover:text-white transition-colors">{topVideo.title}</p>
              <p className="text-[11px] text-zinc-600 mt-0.5">{fmt(topVideo.viewCount)} views · Score {topVideo.performanceScore}</p>
            </div>
            <span className="shrink-0 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2.5 py-1">
              Top performer
            </span>
          </button>
        </section>
      )}

      {brief && (
        <section>
          <p className="text-[11px] text-zinc-600 uppercase tracking-widest font-medium mb-3">Latest Content Brief</p>
          <div className="bg-[#111113] border border-[#27272a] rounded-xl p-5">
            <div className="flex items-start gap-3 mb-4">
              <Lightbulb className="w-4 h-4 text-[#ff3040] shrink-0 mt-0.5" />
              <p className="text-sm font-bold leading-snug">&ldquo;{brief.weeklyIdea}&rdquo;</p>
            </div>
            <div className="space-y-1.5 mb-4">
              {brief.titleOptions.slice(0, 2).map((t, i) => (
                <div
                  key={i}
                  className={`text-xs px-3 py-2 rounded-lg border ${
                    i === 0
                      ? "border-[#ff3040]/30 bg-[#1a1014] text-zinc-300"
                      : "border-[#1f1f22] text-zinc-500"
                  }`}
                >
                  {i === 0 && <span className="text-[10px] text-[#ff3040] font-semibold mr-2 uppercase">Rec</span>}
                  {t}
                </div>
              ))}
            </div>
            <button
              onClick={() => onNavigate("youtube")}
              className="text-xs text-[#ff3040] hover:text-[#e02030] transition-colors"
            >
              See full brief →
            </button>
          </div>
        </section>
      )}

      <div className="pb-4" />
    </div>
  );
}
