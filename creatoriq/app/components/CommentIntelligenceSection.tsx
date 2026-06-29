import { Brain, Lightbulb, MessageSquare, Users, Sparkles, TrendingUp } from "lucide-react";
import type { CommentIntelligence } from "@/types";

function fmt(n: number) {
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const DEMAND_STYLES: Record<string, string> = {
  high: "bg-[#ff3040]/15 text-[#ff3040] border-[#ff3040]/30",
  medium: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  low: "bg-zinc-500/10 text-zinc-500 border-zinc-700",
};

const SENTIMENT_THEME_STYLES: Record<string, string> = {
  positive: "border-emerald-900/50 bg-[#0d1a10]",
  mixed: "border-zinc-700/50 bg-[#111113]",
  negative: "border-red-900/50 bg-[#1a0d0d]",
};

const SENTIMENT_DOT: Record<string, string> = {
  positive: "bg-emerald-500",
  mixed: "bg-zinc-500",
  negative: "bg-red-500",
};

const EMOTION_CONFIG: Array<{ key: keyof CommentIntelligence["emotionalSignals"]; label: string; color: string }> = [
  { key: "excited", label: "Excited", color: "#f59e0b" },
  { key: "grateful", label: "Grateful", color: "#10b981" },
  { key: "curious", label: "Curious", color: "#60a5fa" },
  { key: "confused", label: "Confused", color: "#f97316" },
  { key: "critical", label: "Critical", color: "#ef4444" },
  { key: "requesting", label: "Requesting", color: "#a78bfa" },
];

export function CommentIntelligenceSection({ intel }: { intel: CommentIntelligence }) {
  const { positive, neutral, negative } = intel.sentimentBreakdown;

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-2">
        <Brain className="w-4 h-4 text-[#ff3040]" />
        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-400">
          Comment Intelligence
        </h2>
        <span className="text-xs text-zinc-600 ml-1">{fmt(intel.totalCommentsAnalysed)} comments analysed</span>
      </div>

      {/* Key insight */}
      {intel.keyInsight && (
        <div className="flex items-start gap-3 bg-[#1a1014] border border-[#ff3040]/25 rounded-xl p-5">
          <div className="w-7 h-7 rounded-full bg-[#ff3040]/15 flex items-center justify-center shrink-0 mt-0.5">
            <Sparkles className="w-3.5 h-3.5 text-[#ff3040]" />
          </div>
          <div>
            <p className="text-[11px] text-[#ff3040] uppercase tracking-wider mb-1.5 font-semibold">Key audience insight</p>
            <p className="text-sm text-zinc-200 leading-relaxed">{intel.keyInsight}</p>
          </div>
        </div>
      )}

      {/* Sentiment breakdown */}
      {(positive + neutral + negative) > 0 && (
        <div className="bg-[#111113] border border-[#27272a] rounded-xl p-5">
          <p className="text-xs text-zinc-600 uppercase tracking-wider mb-4">Overall audience sentiment</p>
          <div className="flex h-3 rounded-full overflow-hidden gap-px mb-3">
            {positive > 0 && (
              <div className="bg-emerald-500 rounded-l-full" style={{ width: `${positive}%` }} />
            )}
            {neutral > 0 && (
              <div className="bg-zinc-600" style={{ width: `${neutral}%` }} />
            )}
            {negative > 0 && (
              <div className="bg-red-500 rounded-r-full" style={{ width: `${negative}%` }} />
            )}
          </div>
          <div className="flex gap-5">
            {[
              { label: "Positive", pct: positive, color: "text-emerald-500" },
              { label: "Neutral", pct: neutral, color: "text-zinc-500" },
              { label: "Negative", pct: negative, color: "text-red-500" },
            ].map(({ label, pct, color }) => (
              <div key={label} className="flex items-center gap-1.5 text-xs">
                <span className={`font-semibold tabular-nums ${color}`}>{pct}%</span>
                <span className="text-zinc-600">{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Emotional signals */}
      {EMOTION_CONFIG.some((e) => intel.emotionalSignals[e.key] > 0) && (
        <div className="bg-[#111113] border border-[#27272a] rounded-xl p-5">
          <p className="text-xs text-zinc-600 uppercase tracking-wider mb-4">Emotional signals</p>
          <div className="space-y-2.5">
            {EMOTION_CONFIG.map(({ key, label, color }) => {
              const pct = intel.emotionalSignals[key];
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-xs text-zinc-500 w-20 shrink-0">{label}</span>
                  <div className="flex-1 h-1.5 bg-[#1f1f22] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
                    />
                  </div>
                  <span className="text-xs font-medium tabular-nums text-zinc-400 w-8 text-right">{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Theme clusters */}
      {intel.themes.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="w-3.5 h-3.5 text-zinc-600" />
            <p className="text-xs text-zinc-600 uppercase tracking-wider">Comment themes</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {intel.themes.map((theme, i) => (
              <div
                key={i}
                className={`rounded-xl border p-4 ${SENTIMENT_THEME_STYLES[theme.sentiment]}`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full shrink-0 mt-0.5 ${SENTIMENT_DOT[theme.sentiment]}`} />
                    <p className="text-sm font-semibold text-white">{theme.name}</p>
                  </div>
                  <span className="text-[10px] text-zinc-600 shrink-0 mt-0.5">{theme.commentCount} comments</span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed mb-3">{theme.description}</p>
                <div className="space-y-1.5">
                  {theme.exampleComments.slice(0, 2).map((comment, j) => (
                    <p key={j} className="text-[11px] text-zinc-600 italic border-l-2 border-zinc-700 pl-2 leading-relaxed">
                      &ldquo;{comment.slice(0, 120)}{comment.length > 120 ? "…" : ""}&rdquo;
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Video ideas */}
      {intel.videoIdeas.length > 0 && (
        <div className="bg-[#111113] border border-[#27272a] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="w-3.5 h-3.5 text-zinc-600" />
            <p className="text-xs text-zinc-600 uppercase tracking-wider">Video ideas from your audience</p>
          </div>
          <div className="space-y-3">
            {intel.videoIdeas.map((idea, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="text-[10px] font-mono text-zinc-700 mt-1 shrink-0 w-4">{i + 1}.</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium text-white leading-tight">{idea.idea}</p>
                    <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase tracking-wide ${DEMAND_STYLES[idea.estimatedDemand]}`}>
                      {idea.estimatedDemand}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-600 italic leading-relaxed">
                    &ldquo;{idea.sourceComment.slice(0, 140)}{idea.sourceComment.length > 140 ? "…" : ""}&rdquo;
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Audience personas */}
      {intel.audiencePersonas.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-3.5 h-3.5 text-zinc-600" />
            <p className="text-xs text-zinc-600 uppercase tracking-wider">Audience personas</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {intel.audiencePersonas.map((persona, i) => (
              <div key={i} className="bg-[#111113] border border-[#27272a] rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-[#1f1f22] border border-[#27272a] flex items-center justify-center shrink-0">
                    <TrendingUp className="w-3 h-3 text-zinc-500" />
                  </div>
                  <p className="text-sm font-semibold text-white">{persona.type}</p>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed mb-3">{persona.description}</p>
                <div className="flex flex-wrap gap-1.5">
                  {persona.cues.slice(0, 3).map((cue, j) => (
                    <span key={j} className="text-[10px] bg-[#1f1f22] border border-[#27272a] text-zinc-500 px-2 py-1 rounded-full">
                      {cue}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
