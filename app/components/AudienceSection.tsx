"use client";

import { useState } from "react";
import { Users, ChevronDown, AlertCircle, MessageSquare } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import type { AudienceAnalysis, CommentIntelligence } from "@/types";

interface Props {
  analysis: AudienceAnalysis;
  commentIntel: CommentIntelligence | null;
  onTurnIntoBrief: (prompt: string) => void;
}

const SENTIMENT_COLOR: Record<string, string> = {
  positive: "#34d399",
  mixed: "#f59e0b",
  negative: "#f87171",
};

function buildBriefPrompt(a: AudienceAnalysis, commentIntel: CommentIntelligence | null): string {
  const lines: string[] = [];
  if (a.hasDemographicData && a.headlineStat) {
    lines.push(`${a.headlineStat}.`);
    if (a.under25Pct !== null) lines.push(`${a.under25Pct}% of viewers are under 25.`);
    if (a.malePct !== null && a.femalePct !== null) lines.push(`Gender split: ${a.malePct}% male, ${a.femalePct}% female.`);
    if (a.personaConfirmation) lines.push(a.personaConfirmation);
  }
  if (commentIntel?.themes?.length) {
    const top = commentIntel.themes.slice(0, 3).map((t) => t.name).join(", ");
    lines.push(`Top comment themes: ${top}.`);
  }
  if (commentIntel?.sentimentBreakdown) {
    const { positive, neutral, negative } = commentIntel.sentimentBreakdown;
    lines.push(`Comment sentiment: ${positive}% positive, ${neutral}% neutral, ${negative}% negative.`);
  }
  lines.push("Based on this audience profile, generate a content brief for a video specifically designed to resonate with and grow this demographic.");
  return lines.join(" ");
}

export function AudienceSection({ analysis: a, commentIntel, onTurnIntoBrief }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  const hasSomething = a.hasDemographicData || a.hasCommentData;
  const coverageLabel = a.hasDemographicData
    ? `demographic data · ${a.ageBands.length} age bands`
    : "no demographic data";

  const chartData = a.ageBands.map((b) => ({
    label: b.label,
    rawKey: b.rawKey,
    viewerPct: b.viewerPct,
  }));

  const dominantKey = a.ageBands.reduce(
    (max, b) => (b.viewerPct > (max?.viewerPct ?? 0) ? b : max),
    a.ageBands[0]
  )?.rawKey ?? null;

  const totalSignal = a.commentSentiment
    ? a.commentSentiment.positive + a.commentSentiment.neutral + a.commentSentiment.negative
    : 0;

  const topThemes = (commentIntel?.themes ?? []).slice(0, 4);
  const topPersonas = (commentIntel?.audiencePersonas ?? []).slice(0, 3);

  const emoSignals = a.emotionalSignals
    ? Object.entries(a.emotionalSignals)
        .filter(([, v]) => v > 0)
        .sort(([, a], [, b]) => b - a)
    : [];

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
        <Users className="w-3.5 h-3.5 text-violet-400" />
        <p className="text-[10px] font-semibold text-violet-400 uppercase tracking-wider">Audience</p>
        <span className="text-[10px] text-zinc-600 font-mono ml-1">{coverageLabel}</span>
        {!a.hasDemographicData && (
          <span className="text-[9px] text-amber-600 bg-amber-900/20 px-1.5 py-0.5 rounded ml-1">no demo data</span>
        )}
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={(e) => { e.stopPropagation(); onTurnIntoBrief(buildBriefPrompt(a, commentIntel)); }}
            className="text-[10px] text-zinc-500 hover:text-zinc-300 border border-[#27272a] hover:border-[#3f3f45] px-2.5 py-1 rounded-md transition-colors"
          >
            Turn into a brief
          </button>
          <ChevronDown className={`w-3.5 h-3.5 text-zinc-600 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
        </div>
      </div>

      {!collapsed && (
        <div className="p-5 space-y-5">
          {!hasSomething ? (
            <div className="flex items-start gap-3 text-zinc-500">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
              <p className="text-xs leading-relaxed">
                No demographic data and no comment data available yet. Run a full analysis first — demographic data populates from YouTube Analytics after your channel reaches the reporting threshold (typically 100+ subscribers and some view history).
              </p>
            </div>
          ) : (
            <>
              {/* ── Demographics block ─────────────────────────────────────── */}
              {a.hasDemographicData ? (
                <div className="space-y-4">
                  {/* Headline */}
                  <div className="bg-[#0d0d0f] rounded-lg px-4 py-3">
                    <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Real audience</p>
                    <p className="text-[15px] font-semibold text-zinc-100 leading-snug">{a.headlineStat}</p>
                  </div>

                  {/* Age bar chart */}
                  <div>
                    <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-3">Age breakdown</p>
                    <div className="h-[160px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1d" vertical={false} />
                          <XAxis
                            dataKey="label"
                            tick={{ fill: "#52525b", fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            tickFormatter={(v: number) => `${v}%`}
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
                            formatter={(v) => [`${v}%`, "Viewers"]}
                          />
                          <Bar dataKey="viewerPct" radius={[3, 3, 0, 0]}>
                            {chartData.map((entry) => (
                              <Cell
                                key={entry.rawKey}
                                fill={entry.rawKey === dominantKey ? "#818cf8" : "#3f3f46"}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Gender split */}
                  {a.malePct !== null && a.femalePct !== null && (a.malePct + a.femalePct) > 10 && (
                    <div>
                      <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">Gender split</p>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-zinc-500 w-14 shrink-0">Male</span>
                          <div className="flex-1 bg-[#1a1a1d] rounded-full h-2 overflow-hidden">
                            <div className="h-full rounded-full bg-violet-500" style={{ width: `${a.malePct}%` }} />
                          </div>
                          <span className="text-[10px] text-zinc-400 tabular-nums w-8 text-right">{a.malePct}%</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-zinc-500 w-14 shrink-0">Female</span>
                          <div className="flex-1 bg-[#1a1a1d] rounded-full h-2 overflow-hidden">
                            <div className="h-full rounded-full bg-pink-400" style={{ width: `${a.femalePct}%` }} />
                          </div>
                          <span className="text-[10px] text-zinc-400 tabular-nums w-8 text-right">{a.femalePct}%</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Persona cross-check */}
                  {a.personaConfirmation && (
                    <div className="flex items-start gap-3 bg-[#0d0f1a] border border-violet-900/30 rounded-lg px-4 py-3">
                      <Users className="w-3.5 h-3.5 text-violet-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-zinc-300 leading-relaxed">{a.personaConfirmation}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-start gap-3 border border-[#27272a] rounded-lg px-4 py-3">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-zinc-500 leading-relaxed">
                    Demographic data not available for this channel yet. YouTube Analytics only reports age and gender breakdowns once a channel has sufficient view history. The comment-based signals below are the best available audience signal.
                  </p>
                </div>
              )}

              {/* ── Comment intelligence ───────────────────────────────────── */}
              {a.hasCommentData && (
                <div className="space-y-4 pt-1">
                  <div className="flex items-center gap-2 border-t border-[#1f1f22] pt-4">
                    <MessageSquare className="w-3.5 h-3.5 text-zinc-600" />
                    <p className="text-[10px] text-zinc-600 uppercase tracking-wider">What your audience is saying</p>
                  </div>

                  {/* Sentiment */}
                  {a.commentSentiment && totalSignal > 0 && (
                    <div className="flex gap-2">
                      {[
                        { key: "positive", label: "Positive", val: a.commentSentiment.positive, color: "#34d399" },
                        { key: "neutral", label: "Neutral", val: a.commentSentiment.neutral, color: "#71717a" },
                        { key: "negative", label: "Negative", val: a.commentSentiment.negative, color: "#f87171" },
                      ].map(({ key, label, val, color }) => (
                        <div key={key} className="flex-1 bg-[#0d0d0f] rounded-lg px-3 py-2.5 text-center">
                          <p className="text-base font-bold tabular-nums" style={{ color }}>{val}%</p>
                          <p className="text-[9px] text-zinc-600 mt-0.5">{label}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Emotional signals */}
                  {emoSignals.length > 0 && (
                    <div>
                      <p className="text-[10px] text-zinc-700 uppercase tracking-wider mb-2">Emotional signals</p>
                      <div className="flex flex-wrap gap-1.5">
                        {emoSignals.map(([key, val]) => (
                          <span key={key} className="text-[10px] bg-[#1a1a1d] text-zinc-400 px-2 py-0.5 rounded-full">
                            {key} · {val}%
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Top comment themes */}
                  {topThemes.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[10px] text-zinc-700 uppercase tracking-wider">Recurring themes</p>
                      {topThemes.map((theme, i) => (
                        <div key={i} className="border border-[#1f1f22] rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ background: SENTIMENT_COLOR[theme.sentiment] ?? "#52525b" }}
                            />
                            <p className="text-[11px] font-medium text-zinc-300">{theme.name}</p>
                            <span className="ml-auto text-[9px] text-zinc-700 font-mono">{theme.commentCount} comments</span>
                          </div>
                          <p className="text-[10px] text-zinc-600 leading-relaxed mb-2">{theme.description}</p>
                          {theme.exampleComments.slice(0, 1).map((c, j) => (
                            <p key={j} className="text-[10px] text-zinc-700 italic leading-relaxed truncate">
                              &ldquo;{c}&rdquo;
                            </p>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Audience personas */}
                  {topPersonas.length > 0 && (
                    <div>
                      <p className="text-[10px] text-zinc-700 uppercase tracking-wider mb-2">Audience personas (from comments)</p>
                      <div className="grid sm:grid-cols-3 gap-2">
                        {topPersonas.map((persona, i) => (
                          <div key={i} className="bg-[#0d0d0f] rounded-lg p-3">
                            <p className="text-[11px] font-medium text-zinc-300 mb-1">{persona.type}</p>
                            <p className="text-[10px] text-zinc-600 leading-relaxed">{persona.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
