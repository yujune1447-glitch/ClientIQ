"use client";

import { useState } from "react";
import { TrendingUp, ChevronDown, Eye, Users, ExternalLink, Zap } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import type { GrowthAnalysis } from "@/types";

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function buildBriefPrompt(g: GrowthAnalysis): string {
  const lines: string[] = [
    `My top-performing videos gain a median of ${fmt(g.topMedianSubsGained)} subscribers each, vs ${fmt(g.bottomMedianSubsGained)} for bottom performers.`,
  ];
  if (g.aggregateTraffic) {
    lines.push(`My top videos get ${g.aggregateTraffic.algorithmPct}% of views from algorithm recommendations, ${g.aggregateTraffic.searchPct}% from search.`);
  }
  if (g.trifectaDiverge) {
    lines.push(`My most-viewed ("${g.mostViewedTitle}"), best-retained ("${g.bestRetainedTitle}"), and best-converting ("${g.bestConvertingTitle}") videos are three completely different videos.`);
  }
  lines.push("Based on this growth data, generate a content brief for a video optimised to convert viewers into subscribers — using the patterns from my best-converting content.");
  return lines.join(" ");
}

const TRAFFIC_COLORS = {
  algorithm: "#818cf8",
  search: "#34d399",
  external: "#f59e0b",
  notifications: "#ff3040",
  other: "#52525b",
};

const TRAFFIC_LABELS: Record<string, string> = {
  algorithm: "Algorithm",
  search: "Search",
  external: "External",
  notifications: "Notifications",
  other: "Other",
};

interface Props {
  analysis: GrowthAnalysis;
  onTurnIntoBrief: (prompt: string) => void;
}

export function GrowthSection({ analysis: g, onTurnIntoBrief }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  const subsChartData = g.topConverters.slice(0, 8).map((v) => ({
    name: v.title.length > 28 ? v.title.slice(0, 25) + "…" : v.title,
    subsGained: v.subsGained,
    videoId: v.videoId,
  }));

  const trafficChartData = g.topVideosTraffic.slice(0, 6).map((v) => ({
    name: v.title.length > 22 ? v.title.slice(0, 19) + "…" : v.title,
    algorithm: v.sources.algorithmPct,
    search: v.sources.searchPct,
    external: v.sources.externalPct,
    notifications: v.sources.notificationsPct,
    other: v.sources.otherPct,
  }));

  const trifectaHasData = !!(g.mostViewedVideoId || g.bestRetainedVideoId || g.bestConvertingVideoId);

  return (
    <div className="bg-[#111113] border border-[#1f1f22] rounded-xl overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((c) => !c)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setCollapsed((c) => !c); } }}
        className="w-full flex items-center gap-2 px-5 py-4 border-b border-[#1f1f22] text-left hover:bg-[#13131a] transition-colors cursor-pointer"
      >
        <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
        <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">Growth</p>
        <span className="text-[10px] text-zinc-600 font-mono ml-1">
          {g.videosWithSubsData}/{g.totalVideosAnalysed} videos · subs + traffic
        </span>
        {g.thinSubsData && (
          <span className="text-[9px] text-amber-600 bg-amber-900/20 px-1.5 py-0.5 rounded ml-1">thin data</span>
        )}
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={(e) => { e.stopPropagation(); onTurnIntoBrief(buildBriefPrompt(g)); }}
            className="text-[10px] text-zinc-500 hover:text-zinc-300 border border-[#27272a] hover:border-[#3f3f45] px-2.5 py-1 rounded-md transition-colors"
          >
            Turn into a brief
          </button>
          <ChevronDown className={`w-3.5 h-3.5 text-zinc-600 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
        </div>
      </div>

      {!collapsed && (
        <div className="p-5 space-y-6">

          {/* ── Conversion ─────────────────────────────────────────────── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-3 h-3 text-emerald-500" />
              <p className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wider">Subscriber Conversion</p>
            </div>

            {g.thinSubsData ? (
              <p className="text-xs text-zinc-500 leading-relaxed">
                Only {g.videosWithSubsData} of {g.totalVideosAnalysed} videos have subscriber data — too thin for reliable conclusions. Re-run analysis once YouTube Analytics has populated more videos.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div className="bg-[#0d0d0f] rounded-lg px-4 py-3 text-center">
                    <p className="text-[10px] text-zinc-600 mb-1">Channel median</p>
                    <p className="text-xl font-bold tabular-nums">{fmt(g.channelMedianSubsGained)}</p>
                    <p className="text-[10px] text-zinc-700 mt-0.5">subs / video</p>
                  </div>
                  <div className="bg-[#0d0d0f] rounded-lg px-4 py-3 text-center">
                    <p className="text-[10px] text-zinc-600 mb-1">Top performers</p>
                    <p className={`text-xl font-bold tabular-nums ${g.topMedianSubsGained >= g.channelMedianSubsGained ? "text-emerald-400" : "text-red-400"}`}>
                      {fmt(g.topMedianSubsGained)}
                    </p>
                    <p className="text-[10px] text-zinc-700 mt-0.5">median subs</p>
                  </div>
                  <div className="bg-[#0d0d0f] rounded-lg px-4 py-3 text-center">
                    <p className="text-[10px] text-zinc-600 mb-1">Bottom performers</p>
                    <p className="text-xl font-bold tabular-nums text-zinc-400">
                      {fmt(g.bottomMedianSubsGained)}
                    </p>
                    <p className="text-[10px] text-zinc-700 mt-0.5">median subs</p>
                  </div>
                </div>

                {g.conversionInsight && (
                  <p className="text-xs text-zinc-400 leading-relaxed bg-[#0d0d0f] rounded-lg px-4 py-3 mb-3">
                    {g.conversionInsight}
                  </p>
                )}

                {subsChartData.length > 0 && (
                  <div className="border border-[#1f1f22] rounded-lg overflow-hidden">
                    <p className="text-[10px] text-zinc-600 uppercase tracking-wider px-4 py-2.5 border-b border-[#1f1f22]">
                      Subscribers gained · top {subsChartData.length} videos
                    </p>
                    <div style={{ height: Math.max(160, subsChartData.length * 36) }} className="p-3">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={subsChartData}
                          layout="vertical"
                          margin={{ top: 0, right: 12, bottom: 0, left: 4 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1d" horizontal={false} />
                          <XAxis
                            type="number"
                            tick={{ fill: "#52525b", fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(v: number) => fmt(v)}
                          />
                          <YAxis
                            type="category"
                            dataKey="name"
                            width={130}
                            tick={{ fill: "#71717a", fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip
                            contentStyle={{
                              background: "#111113",
                              border: "1px solid #27272a",
                              borderRadius: 8,
                              fontSize: 11,
                              color: "#d4d4d8",
                            }}
                            formatter={(v) => [fmt(Number(v)), "Subscribers gained"]}
                            cursor={{ fill: "#1a1a1d" }}
                          />
                          <Bar dataKey="subsGained" radius={[0, 3, 3, 0]}>
                            {subsChartData.map((_, i) => (
                              <Cell key={i} fill={i === 0 ? "#34d399" : "#27272a"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Reach beyond the bubble ──────────────────────────────── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <ExternalLink className="w-3 h-3 text-indigo-400" />
              <p className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider">Reach Beyond the Bubble</p>
            </div>

            {g.thinTrafficData ? (
              <p className="text-xs text-zinc-500 leading-relaxed">
                Traffic source data covers fewer than 3 of your top videos — too thin to surface a pattern. Re-run analysis to populate more traffic data.
              </p>
            ) : (
              <>
                {g.trafficInsight && (
                  <p className="text-xs text-zinc-400 leading-relaxed bg-[#0d0d0f] rounded-lg px-4 py-3 mb-3">
                    {g.trafficInsight}
                  </p>
                )}

                {g.aggregateTraffic && (
                  <div className="border border-[#1f1f22] rounded-lg overflow-hidden mb-3">
                    <p className="text-[10px] text-zinc-600 uppercase tracking-wider px-4 py-2.5 border-b border-[#1f1f22]">
                      Aggregate traffic mix · top {g.topVideosTraffic.length} videos
                    </p>
                    <div className="px-4 py-3 space-y-2">
                      {(["algorithm", "search", "external", "notifications", "other"] as const)
                        .filter((k) => g.aggregateTraffic![`${k}Pct`] > 0)
                        .map((k) => {
                          const pct = g.aggregateTraffic![`${k}Pct`];
                          return (
                            <div key={k} className="flex items-center gap-3">
                              <span className="text-[11px] text-zinc-400 w-28 shrink-0">{TRAFFIC_LABELS[k]}</span>
                              <div className="flex-1 bg-[#1a1a1d] rounded-full h-1.5 overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{ width: `${pct}%`, backgroundColor: TRAFFIC_COLORS[k] }}
                                />
                              </div>
                              <span className="text-[11px] text-zinc-400 w-8 text-right tabular-nums font-mono">{pct}%</span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {trafficChartData.length > 0 && (
                  <div className="border border-[#1f1f22] rounded-lg overflow-hidden">
                    <p className="text-[10px] text-zinc-600 uppercase tracking-wider px-4 py-2.5 border-b border-[#1f1f22]">
                      Traffic source mix · per video (%)
                    </p>
                    <div style={{ height: Math.max(160, trafficChartData.length * 36) }} className="p-3">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={trafficChartData}
                          layout="vertical"
                          margin={{ top: 0, right: 8, bottom: 0, left: 4 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1d" horizontal={false} />
                          <XAxis
                            type="number"
                            domain={[0, 100]}
                            tick={{ fill: "#52525b", fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(v: number) => `${v}%`}
                          />
                          <YAxis
                            type="category"
                            dataKey="name"
                            width={120}
                            tick={{ fill: "#71717a", fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip
                            contentStyle={{
                              background: "#111113",
                              border: "1px solid #27272a",
                              borderRadius: 8,
                              fontSize: 11,
                              color: "#d4d4d8",
                            }}
                            formatter={(v, name) => [`${v}%`, TRAFFIC_LABELS[String(name)] ?? String(name)]}
                            cursor={{ fill: "#1a1a1d" }}
                          />
                          {(["algorithm", "search", "external", "notifications", "other"] as const).map((k) => (
                            <Bar key={k} dataKey={k} stackId="traffic" fill={TRAFFIC_COLORS[k]} />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex flex-wrap gap-3 px-4 pb-3">
                      {(["algorithm", "search", "external", "notifications", "other"] as const).map((k) => (
                        <div key={k} className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: TRAFFIC_COLORS[k] }} />
                          <span className="text-[10px] text-zinc-600">{TRAFFIC_LABELS[k]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Trifecta key insight ─────────────────────────────────── */}
          {trifectaHasData && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-3 h-3 text-[#ff3040]" />
                <p className="text-[10px] font-semibold text-[#ff3040] uppercase tracking-wider">The Key Insight</p>
              </div>

              <div className="border border-[#1f1f22] rounded-lg overflow-hidden">
                <div className="grid sm:grid-cols-3 divide-x divide-[#1f1f22]">
                  {g.mostViewedVideoId && (
                    <div className="px-4 py-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Eye className="w-3 h-3 text-zinc-500" />
                        <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Most viewed</p>
                      </div>
                      <p className="text-[12px] text-zinc-300 leading-snug line-clamp-3">{g.mostViewedTitle}</p>
                    </div>
                  )}
                  {g.bestRetainedVideoId && (
                    <div className="px-4 py-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <TrendingUp className="w-3 h-3 text-emerald-500" />
                        <p className="text-[10px] text-emerald-600 uppercase tracking-wider">Best retained</p>
                      </div>
                      <p className="text-[12px] text-zinc-300 leading-snug line-clamp-3">{g.bestRetainedTitle}</p>
                    </div>
                  )}
                  {g.bestConvertingVideoId && (
                    <div className="px-4 py-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Users className="w-3 h-3 text-indigo-400" />
                        <p className="text-[10px] text-indigo-500 uppercase tracking-wider">Best converting</p>
                      </div>
                      <p className="text-[12px] text-zinc-300 leading-snug line-clamp-3">{g.bestConvertingTitle}</p>
                    </div>
                  )}
                </div>
                <div className="border-t border-[#1f1f22] px-4 py-3">
                  <p className="text-xs text-zinc-400 leading-relaxed">{g.trifectaInsight}</p>
                </div>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
