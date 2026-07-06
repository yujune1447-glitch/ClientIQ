"use client";

import { useState, useEffect } from "react";
import { BarChart2, ChevronDown, Zap, TrendingUp, Eye, Loader2 } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import type { RetentionAnalysis } from "@/types";

interface RetentionPoint { elapsed: number; ratio: number; }

interface VideoOption { id: string; title: string; views: number; }

interface Props {
  analysis: RetentionAnalysis;
  videoOptions: VideoOption[];
  onTurnIntoBrief: (prompt: string) => void;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtDur(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function buildInsight(a: RetentionAnalysis): string {
  const diff = Math.round((a.topMedianRetentionPct - a.bottomMedianRetentionPct) * 10) / 10;
  let s = `Your channel holds a median of ${a.channelMedianRetentionPct}% of viewers through each video.`;
  if (a.topMedianRetentionPct > 0 && a.bottomMedianRetentionPct > 0) {
    if (diff >= 5) {
      s += ` Top performers retain ${a.topMedianRetentionPct}% — ${diff} points above your bottom performers (${a.bottomMedianRetentionPct}%). There's a real retention signal separating your winners from your losers.`;
    } else if (diff > 0) {
      s += ` Top performers retain ${a.topMedianRetentionPct}% vs ${a.bottomMedianRetentionPct}% for bottom performers — a small gap, so retention isn't the main differentiator here.`;
    }
  }
  return s;
}

function buildBriefPrompt(a: RetentionAnalysis): string {
  const lines: string[] = [
    `My channel's median retention is ${a.channelMedianRetentionPct}%.`,
    `Top performers retain ${a.topMedianRetentionPct}% vs bottom performers at ${a.bottomMedianRetentionPct}%.`,
  ];
  if (a.relativeRetentionMedian !== null) {
    lines.push(`My videos retain better than ${Math.round(a.relativeRetentionMedian * 100)}% of similar-length YouTube videos.`);
  }
  if (a.viewsRetentionDiverge && a.bestRetainedVideo) {
    lines.push(`My best-retained video ("${a.bestRetainedVideo.title}" at ${a.bestRetainedVideo.avgViewPct}% retention) is not my most-viewed video — there's a gap between what gets views and what keeps them.`);
  }
  lines.push(`Based on this retention data, generate a content brief for a video optimised for audience retention — front-load the most compelling content and structure it to minimise drop-off.`);
  return lines.join(" ");
}

export function RetentionSection({ analysis, videoOptions, onTurnIntoBrief }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [selectedId, setSelectedId] = useState(videoOptions[0]?.id ?? "");
  const [curveCache, setCurveCache] = useState<Map<string, RetentionPoint[]>>(new Map());
  const [curveLoading, setCurveLoading] = useState(false);
  const [curveError, setCurveError] = useState<string | null>(null);

  const curve = curveCache.get(selectedId) ?? null;
  const chartData = curve?.map((p) => ({
    pct: Math.round(p.elapsed * 100),
    ratio: Math.round(p.ratio * 100 * 10) / 10,
  })) ?? [];

  async function loadCurve(videoId: string) {
    if (!videoId) return;
    if (curveCache.has(videoId)) { setSelectedId(videoId); return; }
    setSelectedId(videoId);
    setCurveLoading(true);
    setCurveError(null);
    try {
      const res = await fetch(`/api/youtube/retention-curve?videoId=${videoId}`);
      if (!res.ok) { setCurveError("Retention curve unavailable for this video."); return; }
      const data = await res.json();
      setCurveCache((prev) => new Map(prev).set(videoId, data.curve));
    } catch {
      setCurveError("Failed to load retention curve.");
    } finally {
      setCurveLoading(false);
    }
  }

  useEffect(() => {
    if (videoOptions[0]) loadCurve(videoOptions[0].id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const thin = analysis.videosWithRetentionData < 5;
  const relOk = analysis.relativeRetentionN >= 3 && analysis.relativeRetentionMedian !== null;
  const coveragePct = analysis.totalVideosAnalysed > 0
    ? Math.round((analysis.videosWithRetentionData / analysis.totalVideosAnalysed) * 100)
    : 0;

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
        <BarChart2 className="w-3.5 h-3.5 text-emerald-400" />
        <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">Retention</p>
        <span className="text-[10px] text-zinc-600 font-mono ml-1">
          {analysis.videosWithRetentionData}/{analysis.totalVideosAnalysed} videos · {coveragePct}% coverage
        </span>
        {thin && (
          <span className="text-[9px] text-amber-600 bg-amber-900/20 px-1.5 py-0.5 rounded ml-1">thin data</span>
        )}
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={(e) => { e.stopPropagation(); onTurnIntoBrief(buildBriefPrompt(analysis)); }}
            className="text-[10px] text-zinc-500 hover:text-zinc-300 border border-[#27272a] hover:border-[#3f3f45] px-2.5 py-1 rounded-md transition-colors"
          >
            Turn into a brief
          </button>
          <ChevronDown className={`w-3.5 h-3.5 text-zinc-600 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
        </div>
      </div>

      {!collapsed && (
        <div className="p-5 space-y-4">
          {thin ? (
            <p className="text-xs text-zinc-500 leading-relaxed">
              Only {analysis.videosWithRetentionData} of {analysis.totalVideosAnalysed} videos have retention data — too thin for reliable conclusions.
              Re-run analysis once YouTube Analytics has populated more videos.
            </p>
          ) : (
            <>
              {/* Headline stat blocks */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#0d0d0f] rounded-lg px-4 py-3 text-center">
                  <p className="text-[10px] text-zinc-600 mb-1">Channel median</p>
                  <p className="text-xl font-bold tabular-nums">{analysis.channelMedianRetentionPct}%</p>
                  <p className="text-[10px] text-zinc-700 mt-0.5">avg view %</p>
                </div>
                <div className="bg-[#0d0d0f] rounded-lg px-4 py-3 text-center">
                  <p className="text-[10px] text-zinc-600 mb-1">Top performers</p>
                  <p className={`text-xl font-bold tabular-nums ${analysis.topMedianRetentionPct >= analysis.channelMedianRetentionPct ? "text-emerald-400" : "text-red-400"}`}>
                    {analysis.topMedianRetentionPct}%
                  </p>
                  <p className="text-[10px] text-zinc-700 mt-0.5">median retention</p>
                </div>
                <div className="bg-[#0d0d0f] rounded-lg px-4 py-3 text-center">
                  <p className="text-[10px] text-zinc-600 mb-1">Bottom performers</p>
                  <p className="text-xl font-bold tabular-nums text-red-400">{analysis.bottomMedianRetentionPct}%</p>
                  <p className="text-[10px] text-zinc-700 mt-0.5">median retention</p>
                </div>
              </div>

              {/* Plain-English takeaway */}
              <p className="text-xs text-zinc-400 leading-relaxed bg-[#0d0d0f] rounded-lg px-4 py-3">
                {buildInsight(analysis)}
              </p>

              {/* External benchmark (relativeRetentionPerformance) */}
              {relOk && (
                <div className="flex items-start gap-3 bg-[#0d1a11] border border-emerald-900/30 rounded-lg px-4 py-3">
                  <Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[12px] text-zinc-200 leading-snug">
                      Your videos retain better than{" "}
                      <span className="font-bold text-emerald-400">
                        {Math.round((analysis.relativeRetentionMedian ?? 0) * 100)}%
                      </span>{" "}
                      of similar-length YouTube videos.
                    </p>
                    <p className="text-[10px] text-zinc-600 mt-1 font-mono">
                      relativeRetentionPerformance · n={analysis.relativeRetentionN} videos · median {((analysis.relativeRetentionMedian ?? 0) * 100).toFixed(1)}th percentile
                    </p>
                  </div>
                </div>
              )}

              {/* Cross-layer callout: views ≠ retention */}
              {analysis.viewsRetentionDiverge && analysis.bestRetainedVideo && analysis.mostViewedVideo && (
                <div className="border border-[#1f1f22] rounded-lg overflow-hidden">
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wider px-4 py-2.5 border-b border-[#1f1f22]">
                    Views ≠ Retention — these are different videos
                  </p>
                  <div className="grid sm:grid-cols-2 divide-x divide-[#1f1f22]">
                    <div className="px-4 py-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Eye className="w-3 h-3 text-zinc-500" />
                        <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Most viewed</p>
                      </div>
                      <p className="text-[12px] text-zinc-300 leading-snug line-clamp-2">{analysis.mostViewedVideo.title}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-[10px] text-zinc-500 font-mono">{fmt(analysis.mostViewedVideo.views)} views</span>
                        <span className="text-[10px] text-zinc-600 font-mono">{analysis.mostViewedVideo.avgViewPct}% retention</span>
                      </div>
                    </div>
                    <div className="px-4 py-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <TrendingUp className="w-3 h-3 text-emerald-500" />
                        <p className="text-[10px] text-emerald-600 uppercase tracking-wider">Best retained</p>
                      </div>
                      <p className="text-[12px] text-zinc-300 leading-snug line-clamp-2">{analysis.bestRetainedVideo.title}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-[10px] text-zinc-500 font-mono">{fmt(analysis.bestRetainedVideo.views)} views</span>
                        <span className="text-[10px] text-emerald-500 font-mono font-semibold">{analysis.bestRetainedVideo.avgViewPct}% retention</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Retention curve */}
              <div className="border border-[#1f1f22] rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[#1f1f22]">
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wider shrink-0">Audience retention curve</p>
                  {videoOptions.length > 0 && (
                    <select
                      value={selectedId}
                      onChange={(e) => loadCurve(e.target.value)}
                      className="ml-auto text-[11px] bg-[#0d0d0f] border border-[#27272a] text-zinc-400 rounded-md px-2 py-1 max-w-[280px] truncate cursor-pointer"
                    >
                      {videoOptions.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.title.length > 60 ? v.title.slice(0, 57) + "…" : v.title}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="h-[180px] p-4">
                  {curveLoading ? (
                    <div className="h-full flex items-center justify-center">
                      <Loader2 className="w-5 h-5 text-zinc-600 animate-spin" />
                    </div>
                  ) : curveError ? (
                    <div className="h-full flex items-center justify-center">
                      <p className="text-xs text-zinc-600">{curveError}</p>
                    </div>
                  ) : chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1d" vertical={false} />
                        <XAxis
                          dataKey="pct"
                          tickFormatter={(v: number) => `${v}%`}
                          tick={{ fill: "#52525b", fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                          interval={24}
                        />
                        <YAxis
                          tickFormatter={(v: number) => `${v}%`}
                          tick={{ fill: "#52525b", fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                          domain={[0, 100]}
                          ticks={[0, 25, 50, 75, 100]}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "#111113",
                            border: "1px solid #27272a",
                            borderRadius: 8,
                            fontSize: 11,
                            color: "#d4d4d8",
                          }}
                          formatter={(v) => [`${v}%`, "Viewers remaining"]}
                          labelFormatter={(v) => `${v}% through video`}
                        />
                        <Line
                          type="monotone"
                          dataKey="ratio"
                          stroke="#ff3040"
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 3, fill: "#ff3040" }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <p className="text-xs text-zinc-600">Select a video to load its retention curve.</p>
                    </div>
                  )}
                </div>
                {curve && (
                  <p className="text-[10px] text-zinc-700 px-4 pb-3">
                    Fetched from YouTube Analytics API · elapsedVideoTimeRatio vs audienceWatchRatio
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
