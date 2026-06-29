import type { ChannelSnapshot } from "@/types";
import { TrendingUp, TrendingDown, Minus, CheckCircle, XCircle, Trophy } from "lucide-react";

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function delta(curr: number, prev: number | undefined): { val: string; positive: boolean; zero: boolean } {
  if (prev == null) return { val: "", positive: true, zero: true };
  const diff = curr - prev;
  const pct = prev !== 0 ? ((diff / prev) * 100).toFixed(1) : "∞";
  const positive = diff >= 0;
  const zero = diff === 0;
  const prefix = positive && !zero ? "+" : "";
  return { val: `${prefix}${pct}%`, positive, zero };
}

function sparklinePath(values: number[], w = 120, h = 32): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `M ${pts.join(" L ")}`;
}

function DeltaBadge({ curr, prev, suffix = "" }: { curr: number; prev?: number; suffix?: string }) {
  const d = delta(curr, prev);
  if (d.zero || !d.val) return null;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${d.positive ? "text-emerald-500" : "text-red-500"}`}>
      {d.positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {d.val}{suffix}
    </span>
  );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const path = sparklinePath(values);
  return (
    <svg viewBox="0 0 120 32" className="w-24 h-8" fill="none">
      <path d={path} stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function GrowthSection({ snapshots }: { snapshots: ChannelSnapshot[] }) {
  if (snapshots.length === 0) return null;

  const sorted = [...snapshots].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const latest = sorted[sorted.length - 1];
  const prev = sorted.length >= 2 ? sorted[sorted.length - 2] : undefined;

  const subValues = sorted.map((s) => s.subscriber_count);
  const ctrValues = sorted.map((s) => s.avg_ctr);
  const retValues = sorted.map((s) => s.avg_retention);
  const viewValues = sorted.map((s) => s.avg_views_per_video);

  const withBrief = sorted.filter((s) => s.brief_followed === true);
  const withoutBrief = sorted.filter((s) => s.brief_followed === false);
  const briefAvgViews = withBrief.length ? Math.round(withBrief.reduce((s, r) => s + r.avg_views_per_video, 0) / withBrief.length) : null;
  const noBriefAvgViews = withoutBrief.length ? Math.round(withoutBrief.reduce((s, r) => s + r.avg_views_per_video, 0) / withoutBrief.length) : null;
  const briefLift = briefAvgViews && noBriefAvgViews
    ? Math.round(((briefAvgViews - noBriefAvgViews) / noBriefAvgViews) * 100)
    : null;

  const latestBreakdown = latest.content_breakdown ?? [];

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-[#ff3040]" />
        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-400">Growth Tracking</h2>
        <span className="text-xs text-zinc-600 ml-1">{sorted.length} snapshot{sorted.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Delta cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "Subscribers",
            value: fmt(latest.subscriber_count),
            raw: latest.subscriber_count,
            prevRaw: prev?.subscriber_count,
            spark: subValues,
            color: "#a78bfa",
          },
          {
            label: "Avg CTR",
            value: `${latest.avg_ctr}%`,
            raw: latest.avg_ctr,
            prevRaw: prev?.avg_ctr,
            spark: ctrValues,
            color: "#34d399",
          },
          {
            label: "Avg retention",
            value: `${latest.avg_retention}%`,
            raw: latest.avg_retention,
            prevRaw: prev?.avg_retention,
            spark: retValues,
            color: "#60a5fa",
          },
          {
            label: "Avg views/video",
            value: fmt(latest.avg_views_per_video),
            raw: latest.avg_views_per_video,
            prevRaw: prev?.avg_views_per_video,
            spark: viewValues,
            color: "#f97316",
          },
        ].map((card) => (
          <div key={card.label} className="bg-[#111113] border border-[#1f1f22] rounded-xl p-4 flex flex-col gap-2">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] text-zinc-600 uppercase tracking-wider mb-1">{card.label}</p>
                <p className="text-xl font-bold tabular-nums">{card.value}</p>
              </div>
              <Sparkline values={card.spark} color={card.color} />
            </div>
            {card.prevRaw != null && <DeltaBadge curr={card.raw} prev={card.prevRaw} />}
          </div>
        ))}
      </div>

      {/* Brief compliance vs performance */}
      {briefLift !== null && (
        <div className={`rounded-xl border p-5 ${briefLift >= 0 ? "bg-[#0f1a14] border-emerald-900/40" : "bg-[#1a0f0f] border-red-900/40"}`}>
          <div className="flex items-start gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${briefLift >= 0 ? "bg-emerald-900/40" : "bg-red-900/40"}`}>
              {briefLift >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : <TrendingDown className="w-4 h-4 text-red-400" />}
            </div>
            <div>
              <p className={`text-sm font-semibold mb-1 ${briefLift >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                Brief recommendations {briefLift >= 0 ? `improve` : `underperform by`} {Math.abs(briefLift)}% on avg views
              </p>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Weeks following brief: <span className="text-white font-medium">{fmt(briefAvgViews!)} avg views</span> across {withBrief.length} period{withBrief.length !== 1 ? "s" : ""} ·{" "}
                Weeks not following: <span className="text-white font-medium">{fmt(noBriefAvgViews!)} avg views</span> across {withoutBrief.length} period{withoutBrief.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Content format breakdown */}
      {latestBreakdown.length > 0 && (
        <div className="bg-[#111113] border border-[#1f1f22] rounded-xl p-5">
          <p className="text-xs text-zinc-600 uppercase tracking-wider mb-4">Content formats driving performance</p>
          <div className="space-y-3">
            {latestBreakdown.map((fmt_stat, i) => {
              const maxScore = latestBreakdown[0].avgScore;
              const pct = maxScore > 0 ? (fmt_stat.avgScore / maxScore) * 100 : 0;
              return (
                <div key={fmt_stat.format} className="flex items-center gap-3">
                  <div className="w-24 shrink-0">
                    <p className="text-xs text-zinc-400">{fmt_stat.format}</p>
                    <p className="text-[10px] text-zinc-600">{fmt_stat.count} video{fmt_stat.count !== 1 ? "s" : ""}</p>
                  </div>
                  <div className="flex-1 h-1.5 bg-[#1f1f22] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${i === 0 ? "bg-[#ff3040]" : "bg-zinc-600"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-medium tabular-nums">{fmt_stat.avgScore}x</p>
                    <p className="text-[10px] text-zinc-600">{fmt(fmt_stat.avgViews)} avg views</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Weekly history table */}
      {sorted.length >= 2 && (
        <div className="bg-[#111113] border border-[#1f1f22] rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[#1f1f22]">
            <p className="text-xs text-zinc-600 uppercase tracking-wider">Week-over-week history</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#1f1f22]">
                  <th className="text-left px-5 py-2.5 text-zinc-600 font-medium">Period</th>
                  <th className="text-left px-3 py-2.5 text-zinc-600 font-medium">Brief</th>
                  <th className="text-left px-3 py-2.5 text-zinc-600 font-medium hidden sm:table-cell">Top video</th>
                  <th className="text-right px-3 py-2.5 text-zinc-600 font-medium">Subscribers</th>
                  <th className="text-right px-3 py-2.5 text-zinc-600 font-medium hidden md:table-cell">CTR</th>
                  <th className="text-right px-3 py-2.5 text-zinc-600 font-medium hidden md:table-cell">Retention</th>
                  <th className="text-right px-5 py-2.5 text-zinc-600 font-medium">Avg views</th>
                </tr>
              </thead>
              <tbody>
                {[...sorted].reverse().map((snap, i, arr) => {
                  const prevSnap = arr[i + 1];
                  const subDelta = prevSnap ? snap.subscriber_count - prevSnap.subscriber_count : null;
                  const viewDelta = prevSnap ? delta(snap.avg_views_per_video, prevSnap.avg_views_per_video) : null;
                  return (
                    <tr key={snap.id} className="border-b border-[#1a1a1c] last:border-0 hover:bg-[#141416] transition-colors">
                      <td className="px-5 py-3 text-zinc-400">
                        {new Date(snap.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </td>
                      <td className="px-3 py-3">
                        {snap.brief_followed === null ? (
                          <Minus className="w-3.5 h-3.5 text-zinc-700" />
                        ) : snap.brief_followed ? (
                          <div className="flex items-center gap-1">
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            <span className="text-emerald-600 hidden lg:inline truncate max-w-[120px]" title={snap.brief_match_video_title ?? ""}>
                              {snap.brief_match_video_title ? `${snap.brief_match_score}% match` : ""}
                            </span>
                          </div>
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-red-800" />
                        )}
                      </td>
                      <td className="px-3 py-3 text-zinc-400 hidden sm:table-cell max-w-[160px]">
                        {snap.top_video_title ? (
                          <span className="truncate block" title={snap.top_video_title}>
                            {snap.top_video_views != null && <span className="text-zinc-600 mr-1">{fmt(snap.top_video_views)}</span>}
                            {snap.top_video_title.slice(0, 40)}{snap.top_video_title.length > 40 ? "…" : ""}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <span className="font-medium tabular-nums">{fmt(snap.subscriber_count)}</span>
                        {subDelta !== null && subDelta !== 0 && (
                          <span className={`ml-1.5 ${subDelta > 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {subDelta > 0 ? "+" : ""}{fmt(subDelta)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right text-zinc-400 hidden md:table-cell tabular-nums">{snap.avg_ctr}%</td>
                      <td className="px-3 py-3 text-right text-zinc-400 hidden md:table-cell tabular-nums">{snap.avg_retention}%</td>
                      <td className="px-5 py-3 text-right">
                        <span className="font-medium tabular-nums">{fmt(snap.avg_views_per_video)}</span>
                        {viewDelta && !viewDelta.zero && (
                          <span className={`ml-1.5 ${viewDelta.positive ? "text-emerald-600" : "text-red-600"}`}>{viewDelta.val}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Trophy: best week */}
      {sorted.length >= 2 && (() => {
        const best = [...sorted].sort((a, b) => b.avg_views_per_video - a.avg_views_per_video)[0];
        return (
          <div className="flex items-center gap-3 bg-[#111113] border border-[#1f1f22] rounded-xl px-5 py-3">
            <Trophy className="w-4 h-4 text-yellow-500 shrink-0" />
            <p className="text-xs text-zinc-400">
              Best period: <span className="text-white font-medium">{new Date(best.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
              {" "}— {fmt(best.avg_views_per_video)} avg views/video
              {best.brief_followed && <span className="text-emerald-600 ml-1.5">(brief followed)</span>}
            </p>
          </div>
        );
      })()}
    </section>
  );
}
