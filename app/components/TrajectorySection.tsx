"use client";

import { useState } from "react";
import { TrendingUp, ChevronDown, Activity, AlertCircle } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import type { TrajectoryAnalysis, ChannelSnapshot } from "@/types";

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtSubs(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function buildBriefPrompt(a: TrajectoryAnalysis): string {
  const lines: string[] = [];
  lines.push(`My channel trajectory is: ${a.verdictText}`);
  if (a.changePercent !== null) {
    const dir = a.changePercent > 0 ? "up" : "down";
    lines.push(`Views are ${dir} ${Math.abs(Math.round(a.changePercent))}% comparing the last two active quarters.`);
  }
  lines.push("Based on this trajectory, generate a content brief for a video that plays into or corrects this trend.");
  return lines.join(" ");
}

const VERDICT_CONFIG = {
  accelerating: {
    label: "Accelerating",
    color: "#10b981",
    bg: "bg-emerald-900/20",
    border: "border-emerald-700/40",
    text: "text-emerald-400",
    icon: TrendingUp,
  },
  steady: {
    label: "Steady",
    color: "#71717a",
    bg: "bg-zinc-800/40",
    border: "border-zinc-700/40",
    text: "text-zinc-400",
    icon: Activity,
  },
  cooling: {
    label: "Cooling",
    color: "#f87171",
    bg: "bg-red-900/20",
    border: "border-red-700/40",
    text: "text-red-400",
    icon: Activity,
  },
  insufficient_data: {
    label: "Not enough data",
    color: "#52525b",
    bg: "bg-zinc-800/20",
    border: "border-zinc-700/30",
    text: "text-zinc-500",
    icon: AlertCircle,
  },
};

interface Props {
  analysis: TrajectoryAnalysis;
  snapshots?: ChannelSnapshot[];
  onTurnIntoBrief: (prompt: string) => void;
}

export function TrajectorySection({ analysis: a, snapshots, onTurnIntoBrief }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  const cfg = VERDICT_CONFIG[a.verdict];
  const VerdictIcon = cfg.icon;

  const subsData = (snapshots ?? [])
    .filter((s) => s.subscriber_count > 0)
    .sort((x, y) => new Date(x.created_at).getTime() - new Date(y.created_at).getTime());
  const hasSubsTrack = subsData.length >= 2;

  const subsMin = hasSubsTrack ? Math.min(...subsData.map((s) => s.subscriber_count)) : 0;
  const subsMax = hasSubsTrack ? Math.max(...subsData.map((s) => s.subscriber_count)) : 0;
  const subsDelta = hasSubsTrack ? subsMax - subsMin : 0;
  const subsDeltaDir = hasSubsTrack
    ? subsData[subsData.length - 1].subscriber_count >= subsData[0].subscriber_count
      ? "up"
      : "down"
    : null;

  const chartData = a.quarters.map((q) => ({
    label: q.label,
    medianViews: q.medianViews,
    n: q.n,
  }));

  const hasChart = chartData.length >= 2;
  const maxViews = hasChart ? Math.max(...chartData.map((d) => d.medianViews), 1) : 1;

  const priorQ = a.quarters.findLast((q) => q.n >= 2 && q !== a.quarters[a.quarters.length - 1]) ?? null;
  const recentQ = a.quarters[a.quarters.length - 1] ?? null;

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
        <TrendingUp className="w-3.5 h-3.5 text-sky-400" />
        <p className="text-[10px] font-semibold text-sky-400 uppercase tracking-wider">Trajectory</p>
        <span className="text-[10px] text-zinc-600 font-mono ml-1">
          {a.quarters.length} quarters · {a.verdict !== "insufficient_data" ? cfg.label.toLowerCase() : "insufficient data"}
        </span>
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={(e) => { e.stopPropagation(); onTurnIntoBrief(buildBriefPrompt(a)); }}
            className="text-[10px] text-zinc-500 hover:text-zinc-300 border border-[#27272a] hover:border-[#3f3f45] px-2.5 py-1 rounded-md transition-colors"
          >
            Turn into a brief
          </button>
          <ChevronDown className={`w-3.5 h-3.5 text-zinc-600 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
        </div>
      </div>

      {!collapsed && (
        <div className="p-5 space-y-5">
          {/* ── Verdict banner ──────────────────────────────────────────── */}
          <div className={`flex items-start gap-3 ${cfg.bg} border ${cfg.border} rounded-lg px-4 py-3`}>
            <VerdictIcon className={`w-3.5 h-3.5 ${cfg.text} shrink-0 mt-0.5`} />
            <div>
              <p className={`text-[11px] font-semibold ${cfg.text} mb-0.5`}>{cfg.label}</p>
              <p className="text-[12px] text-zinc-300 leading-relaxed">{a.verdictText}</p>
              {a.changePercent !== null && (
                <p className="text-[10px] text-zinc-600 font-mono mt-1">
                  {a.changePercent > 0 ? "+" : ""}{Math.round(a.changePercent)}% quarter-on-quarter · 25% threshold · view accumulation bias factored in
                </p>
              )}
            </div>
          </div>

          {/* ── View velocity line chart ─────────────────────────────────── */}
          {hasChart && (
            <div>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-3">Quarterly median views</p>
              <div className="h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1d" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "#52525b", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(v: number) => fmt(v)}
                      tick={{ fill: "#52525b", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    {priorQ && recentQ && a.priorMedianViews !== null && (
                      <ReferenceLine
                        y={a.priorMedianViews}
                        stroke="#27272a"
                        strokeDasharray="4 4"
                      />
                    )}
                    <Tooltip
                      contentStyle={{
                        background: "#111113",
                        border: "1px solid #27272a",
                        borderRadius: 8,
                        fontSize: 11,
                        color: "#d4d4d8",
                      }}
                      formatter={(v, _name, props) => {
                        const entry = props.payload as { n: number };
                        return [`${fmt(Number(v))} median views (n=${entry.n})`, "Quarter"];
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="medianViews"
                      stroke="#38bdf8"
                      strokeWidth={2}
                      dot={{ fill: "#38bdf8", r: 3, strokeWidth: 0 }}
                      activeDot={{ fill: "#38bdf8", r: 4, strokeWidth: 0 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center gap-4 mt-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-0.5 bg-sky-400 inline-block" />
                  <span className="text-[9px] text-zinc-600">Median views / quarter</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-0.5 bg-[#27272a] inline-block" style={{ borderTop: "1px dashed #27272a" }} />
                  <span className="text-[9px] text-zinc-600">Prior quarter reference</span>
                </div>
              </div>
            </div>
          )}

          {a.verdict === "insufficient_data" && !hasChart && (
            <div className="flex items-start gap-3 text-zinc-500">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-sky-700" />
              <p className="text-xs leading-relaxed">
                Not enough data across quarters to compute a reliable trend. At least two quarters with 2+ videos each are required.
              </p>
            </div>
          )}

          {/* ── Quarter breakdown table ──────────────────────────────────── */}
          {a.quarters.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-zinc-700 uppercase tracking-wider mb-2">Quarter breakdown</p>
              {a.quarters.map((q, i) => {
                const isLast = i === a.quarters.length - 1;
                const pct = Math.round((q.medianViews / maxViews) * 100);
                return (
                  <div key={q.label} className="flex items-center gap-3">
                    <span className={`text-[10px] w-16 shrink-0 font-mono ${isLast ? "text-sky-500" : "text-zinc-500"}`}>
                      {q.label}
                    </span>
                    <div className="flex-1 bg-[#1a1a1d] rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          background: isLast ? "#38bdf8" : "#3f3f46",
                        }}
                      />
                    </div>
                    <span className="text-[10px] text-zinc-500 w-14 text-right tabular-nums">{fmt(q.medianViews)}</span>
                    <span className="text-[9px] text-zinc-700 w-8 text-right font-mono">n={q.n}</span>
                    {q.n < 2 && (
                      <span className="text-[9px] text-zinc-700 bg-[#1a1a1d] px-1 rounded w-12 text-center">low n</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Subscriber trajectory (if available from snapshots) ───────── */}
          {hasSubsTrack && (
            <div className="border-t border-[#1a1a1d] pt-4">
              <p className="text-[10px] text-zinc-700 uppercase tracking-wider mb-3">Subscriber trajectory</p>
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-[10px] text-zinc-600">Current</p>
                  <p className="text-sm font-semibold text-zinc-300">
                    {fmtSubs(subsData[subsData.length - 1].subscriber_count)}
                  </p>
                </div>
                <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${subsDeltaDir === "up" ? "text-emerald-400" : "text-red-400"}`}>
                  <TrendingUp className={`w-3.5 h-3.5 ${subsDeltaDir === "down" ? "rotate-180" : ""}`} />
                  {subsDeltaDir === "up" ? "+" : "-"}{fmtSubs(Math.abs(subsDelta))} over {subsData.length} snapshots
                </div>
              </div>
              <div className="h-[80px] mt-3">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={subsData.map((s) => ({
                      label: new Date(s.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                      subs: s.subscriber_count,
                    }))}
                    margin={{ top: 4, right: 8, bottom: 0, left: -16 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1d" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "#52525b", fontSize: 9 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(v: number) => fmtSubs(v)}
                      tick={{ fill: "#52525b", fontSize: 9 }}
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
                      formatter={(v) => [`${fmtSubs(Number(v))} subscribers`, "Subs"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="subs"
                      stroke="#818cf8"
                      strokeWidth={1.5}
                      dot={{ fill: "#818cf8", r: 2, strokeWidth: 0 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
