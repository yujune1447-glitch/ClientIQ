"use client";

import { useState } from "react";
import { Clock, ChevronDown, AlertCircle, TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import type { CadenceAnalysis } from "@/types";

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function buildBriefPrompt(a: CadenceAnalysis): string {
  const lines: string[] = [];
  if (a.bestDay && a.bestDayMultiplier) {
    lines.push(`My strongest posting day is ${a.bestDay} (${a.bestDayMultiplier}× channel median views).`);
  }
  if (a.topPerformerTimeSlot) {
    lines.push(`My top-performing videos tend to be uploaded in the ${a.topPerformerTimeSlot.toLowerCase()}.`);
  }
  if (a.frequencyInsight) lines.push(a.frequencyInsight);
  lines.push("Based on this cadence data, generate a content brief for a video optimised around my strongest posting patterns — including timing, frequency, and upload strategy.");
  return lines.join(" ");
}

interface Props {
  analysis: CadenceAnalysis;
  onTurnIntoBrief: (prompt: string) => void;
}

export function CadenceSection({ analysis: a, onTurnIntoBrief }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  const reliableDays = a.byDay.filter((d) => !d.lowConfidence);
  const hasPattern = reliableDays.length >= 3;

  const chartData = [...a.byDay].sort((x, y) => {
    const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return DAYS.indexOf(x.day) - DAYS.indexOf(y.day);
  });

  const maxMedian = Math.max(...chartData.map((d) => d.medianViews), 1);
  const coverageLabel = a.thinData
    ? `${a.totalVideos} videos — thin data`
    : `${a.totalVideos} videos · ${a.byDay.length} posting days`;

  const freqIcon =
    a.frequencyCorrelates === "more" ? <TrendingUp className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" /> :
    a.frequencyCorrelates === "less" ? <TrendingDown className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" /> :
    <Minus className="w-3 h-3 text-zinc-600 shrink-0 mt-0.5" />;

  return (
    <div className="bg-[#111113] border border-[#1f1f22] rounded-xl overflow-hidden">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center gap-2 px-5 py-4 border-b border-[#1f1f22] text-left hover:bg-[#13131a] transition-colors"
      >
        <Clock className="w-3.5 h-3.5 text-amber-400" />
        <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">Cadence</p>
        <span className="text-[10px] text-zinc-600 font-mono ml-1">{coverageLabel}</span>
        {a.thinData && (
          <span className="text-[9px] text-amber-600 bg-amber-900/20 px-1.5 py-0.5 rounded ml-1">thin data</span>
        )}
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={(e) => { e.stopPropagation(); onTurnIntoBrief(buildBriefPrompt(a)); }}
            className="text-[10px] text-zinc-500 hover:text-zinc-300 border border-[#27272a] hover:border-[#3f3f45] px-2.5 py-1 rounded-md transition-colors"
          >
            Turn into a brief
          </button>
          <ChevronDown className={`w-3.5 h-3.5 text-zinc-600 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
        </div>
      </button>

      {!collapsed && (
        <div className="p-5 space-y-5">
          {a.thinData ? (
            <div className="flex items-start gap-3 text-zinc-500">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
              <p className="text-xs leading-relaxed">
                Only {a.totalVideos} videos — cadence patterns on this sample size are statistically unreliable. Patterns below are shown for reference but should not drive posting decisions.
              </p>
            </div>
          ) : null}

          {/* ── Day-of-week bar chart ───────────────────────────────────── */}
          {chartData.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Median views by posting day</p>
                {!hasPattern && (
                  <span className="text-[9px] text-zinc-700 bg-[#1a1a1d] px-1.5 py-0.5 rounded">
                    bars with n&lt;3 are unreliable
                  </span>
                )}
              </div>
              <div className="h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1d" vertical={false} />
                    <XAxis
                      dataKey="day"
                      tickFormatter={(v: string) => v.slice(0, 3)}
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
                    <Tooltip
                      contentStyle={{
                        background: "#111113",
                        border: "1px solid #27272a",
                        borderRadius: 8,
                        fontSize: 11,
                        color: "#d4d4d8",
                      }}
                      formatter={(v, _name, props) => {
                        const entry = props.payload as { n: number; lowConfidence: boolean; topPerformerCount: number };
                        const suffix = entry.lowConfidence ? ` (n=${entry.n} — low confidence)` : ` (n=${entry.n})`;
                        return [`${fmt(Number(v))} views${suffix}`, "Median"];
                      }}
                    />
                    <Bar dataKey="medianViews" radius={[3, 3, 0, 0]}>
                      {chartData.map((entry) => (
                        <Cell
                          key={entry.day}
                          fill={
                            entry.lowConfidence
                              ? "#27272a"
                              : entry.day === a.bestDay
                                ? "#f59e0b"
                                : entry.medianViews >= a.channelMedianViews
                                  ? "#78716c"
                                  : "#3f3f46"
                          }
                          opacity={entry.lowConfidence ? 0.5 : 1}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center gap-4 mt-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm bg-amber-500 inline-block" />
                  <span className="text-[9px] text-zinc-600">Best day</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm bg-[#78716c] inline-block" />
                  <span className="text-[9px] text-zinc-600">Above median</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm bg-[#27272a] inline-block opacity-50" />
                  <span className="text-[9px] text-zinc-600">n&lt;3 (unreliable)</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Day headline ───────────────────────────────────────────── */}
          {a.bestDay && a.bestDayMultiplier && !a.thinData && (
            <div className="bg-[#0d0d0f] rounded-lg px-4 py-3 flex items-center gap-3">
              <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <div>
                <p className="text-[12px] text-zinc-200 leading-snug">
                  <span className="font-semibold text-amber-400">{a.bestDay}</span> is your strongest posting day —{" "}
                  {a.bestDayMultiplier}× channel median views
                  {a.topPerformerTimeSlot ? `, most top performers uploaded in the ${a.topPerformerTimeSlot.toLowerCase()}` : ""}.
                </p>
                <p className="text-[9px] text-zinc-600 mt-0.5 font-mono">
                  Based on median views · days with n&lt;3 excluded from comparison
                </p>
              </div>
            </div>
          )}

          {/* ── Frequency vs performance ───────────────────────────────── */}
          {a.frequencyInsight && (
            <div className="flex items-start gap-3 bg-[#0d0d0f] rounded-lg px-4 py-3">
              {freqIcon}
              <p className="text-xs text-zinc-400 leading-relaxed">{a.frequencyInsight}</p>
            </div>
          )}

          {/* ── Per-day detail table (collapsed by default) ────────────── */}
          <div className="space-y-1">
            <p className="text-[10px] text-zinc-700 uppercase tracking-wider mb-2">All days</p>
            {chartData.map((d) => (
              <div
                key={d.day}
                className={`flex items-center gap-3 ${d.lowConfidence ? "opacity-40" : ""}`}
              >
                <span className="text-[10px] text-zinc-500 w-24 shrink-0">{d.day}</span>
                <div className="flex-1 bg-[#1a1a1d] rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.round((d.medianViews / maxMedian) * 100)}%`,
                      background: d.day === a.bestDay ? "#f59e0b" : "#52525b",
                    }}
                  />
                </div>
                <span className="text-[10px] text-zinc-500 w-14 text-right tabular-nums">{fmt(d.medianViews)}</span>
                <span className="text-[9px] text-zinc-700 w-8 text-right font-mono">n={d.n}</span>
                {d.topPerformerCount > 0 && (
                  <span className="text-[9px] text-amber-700 font-mono w-10 shrink-0">
                    ★{d.topPerformerCount}
                  </span>
                )}
              </div>
            ))}
            <p className="text-[9px] text-zinc-700 mt-2">★ = top performers posted on this day</p>
          </div>
        </div>
      )}
    </div>
  );
}
