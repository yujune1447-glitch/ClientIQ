"use client";

import { Sparkles } from "lucide-react";
import type { ChannelSynthesis } from "@/types";

const LAYER_CHIP: Record<string, { label: string; color: string }> = {
  packaging: { label: "Packaging", color: "bg-violet-900/30 text-violet-400 border-violet-800/30" },
  retention:  { label: "Retention",  color: "bg-blue-900/30 text-blue-400 border-blue-800/30" },
  growth:     { label: "Growth",     color: "bg-emerald-900/30 text-emerald-400 border-emerald-800/30" },
  audience:   { label: "Audience",   color: "bg-indigo-900/30 text-indigo-400 border-indigo-800/30" },
  cadence:    { label: "Cadence",    color: "bg-amber-900/30 text-amber-500 border-amber-800/30" },
  trajectory: { label: "Trajectory", color: "bg-sky-900/30 text-sky-400 border-sky-800/30" },
  comments:   { label: "Comments",   color: "bg-rose-900/30 text-rose-400 border-rose-800/30" },
};

interface Props {
  synthesis: ChannelSynthesis;
  totalVideos: number;
  channelMedianViews: number;
}

function fmtViews(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function ChannelSynthesisSection({ synthesis, totalVideos, channelMedianViews }: Props) {
  return (
    <div className="bg-[#0d0d10] border border-[#ff3040]/20 rounded-xl overflow-hidden shadow-[0_0_0_1px_rgba(255,48,64,0.05)]">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-[#1f1f22]">
        <Sparkles className="w-3.5 h-3.5 text-[#ff3040]" />
        <p className="text-[10px] font-semibold text-[#ff3040] uppercase tracking-wider">What Works on Your Channel</p>
        <span className="ml-auto text-[10px] text-zinc-600 font-mono">
          {totalVideos} videos · median {fmtViews(channelMedianViews)}
        </span>
      </div>

      <div className="p-5 space-y-4">
        {/* Headline */}
        <p className="text-sm font-semibold text-zinc-100 leading-snug border-l-2 border-[#ff3040]/40 pl-3">
          {synthesis.headline}
        </p>

        {/* Takeaways */}
        <div className="space-y-3">
          {synthesis.takeaways.map((t, i) => (
            <div key={i} className="bg-[#111113] rounded-lg px-4 py-3 space-y-1.5">
              <div className="flex items-start gap-2.5">
                <span className="text-[#ff3040] font-mono text-[11px] shrink-0 mt-0.5 select-none">{i + 1}.</span>
                <p className="text-[13px] text-zinc-200 leading-snug">{t.text}</p>
              </div>

              <div className="flex items-start gap-2.5 pl-[18px]">
                <p className="text-[10px] text-zinc-600 font-mono leading-snug flex-1">{t.evidence}</p>
              </div>

              {t.layers.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap pl-[18px] pt-0.5">
                  {t.layers.map((layer) => {
                    const chip = LAYER_CHIP[layer];
                    if (!chip) return null;
                    return (
                      <span
                        key={layer}
                        className={`text-[9px] font-medium px-1.5 py-0.5 rounded border ${chip.color}`}
                      >
                        {chip.label}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        <p className="text-[9px] text-zinc-700 font-mono">
          AI synthesis across all six analysis layers · {new Date(synthesis.generatedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
        </p>
      </div>
    </div>
  );
}
