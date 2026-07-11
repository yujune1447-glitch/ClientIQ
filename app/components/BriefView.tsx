import { Sparkles, Type, Camera, Clock, Film, ListOrdered, BarChart3, TrendingUp } from "lucide-react";
import { Card } from "@/app/components/AnalysisContent";
import type { ContentBrief, ChannelSummary } from "@/types";

const fmt = (n: number) =>
  new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);

const hasText = (s?: string | null): s is string => typeof s === "string" && s.trim().length > 0;

// A labelled sub-field used inside structured sections (hook phases, thumbnail spec).
function Field({ label, value }: { label: string; value?: string }) {
  if (!hasText(value)) return null;
  return (
    <div>
      <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-[13px] text-zinc-200 leading-snug">{value}</p>
    </div>
  );
}

interface Props {
  brief: ContentBrief;
  summary: ChannelSummary;
}

export function BriefView({ brief, summary }: Props) {
  const { channel } = summary;
  const hook = brief.hook;
  const thumbnail = brief.thumbnail;
  const titleOptions = (brief.titleOptions ?? []).filter(hasText);
  const talkingPoints = (brief.keyTalkingPoints ?? []).filter(hasText);
  const dataEvidence = (brief.dataEvidence ?? []).filter((d) => hasText(d?.claim) || hasText(d?.evidence));

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 pb-24 space-y-5">
      {/* Channel header */}
      <div className="flex items-center gap-3 pb-1">
        {channel?.thumbnail ? (
          <img src={channel.thumbnail} alt="" className="w-9 h-9 rounded-full object-cover" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-[#ff3040] flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-base font-semibold leading-tight truncate">{channel?.title ?? "Your channel"}</h1>
          <p className="text-[11px] text-zinc-500">Your weekly game plan</p>
        </div>
        {channel?.subscriberCount != null && (
          <div className="ml-auto text-right shrink-0">
            <p className="text-sm font-bold tabular-nums">{fmt(channel.subscriberCount)}</p>
            <p className="text-[10px] text-zinc-600">Subscribers</p>
          </div>
        )}
      </div>

      {/* Hero — the weekly idea */}
      {hasText(brief.weeklyIdea) && (
        <div className="bg-[#0d0d10] border border-[#ff3040]/20 rounded-xl overflow-hidden shadow-[0_0_0_1px_rgba(255,48,64,0.05)]">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-[#1f1f22]">
            <Sparkles className="w-3.5 h-3.5 text-[#ff3040]" />
            <p className="text-[10px] font-semibold text-[#ff3040] uppercase tracking-wider">This Week&apos;s Idea</p>
          </div>
          <div className="p-5">
            <p className="text-lg font-semibold text-zinc-100 leading-snug">{brief.weeklyIdea}</p>
          </div>
        </div>
      )}

      {/* Title options */}
      {titleOptions.length > 0 && (
        <Card title="Title options">
          <div className="space-y-2.5">
            {titleOptions.map((t, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <Type className="w-3.5 h-3.5 text-[#ff3040] shrink-0 mt-0.5" />
                <p className="text-[13px] text-zinc-200 leading-snug">{t}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Length + format meta */}
      {(hasText(brief.recommendedLength) || hasText(brief.format)) && (
        <Card title="Format">
          <div className="space-y-4">
            {hasText(brief.recommendedLength) && (
              <div className="flex items-start gap-2.5">
                <Clock className="w-3.5 h-3.5 text-zinc-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Recommended length</p>
                  <p className="text-[13px] text-zinc-200 leading-snug">{brief.recommendedLength}</p>
                </div>
              </div>
            )}
            {hasText(brief.format) && (
              <div className="flex items-start gap-2.5">
                <Film className="w-3.5 h-3.5 text-zinc-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Production approach</p>
                  <p className="text-[13px] text-zinc-200 leading-snug">{brief.format}</p>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Hook */}
      {(typeof hook === "string" ? hasText(hook) : !!hook) && (
        <Card title="The hook" subtitle="First 30 seconds">
          {typeof hook === "string" ? (
            <p className="text-[13px] text-zinc-200 leading-relaxed">{hook}</p>
          ) : (
            <div className="space-y-4">
              <Field label="Opening line" value={hook.openingLine} />
              <Field label="Setup (0–10s)" value={hook.setup} />
              <Field label="Tension (10–20s)" value={hook.tension} />
              <Field label="Payoff (20–30s)" value={hook.payoff} />
            </div>
          )}
        </Card>
      )}

      {/* Key talking points */}
      {talkingPoints.length > 0 && (
        <Card title="Key talking points">
          <div className="space-y-2.5">
            {talkingPoints.map((p, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <ListOrdered className="w-3.5 h-3.5 text-zinc-500 shrink-0 mt-0.5" />
                <p className="text-[13px] text-zinc-200 leading-snug">{p}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Thumbnail direction */}
      {(typeof thumbnail === "string" ? hasText(thumbnail) : !!thumbnail) || hasText(brief.thumbnailDirection) ? (
        <Card title="Thumbnail direction">
          {typeof thumbnail === "object" && thumbnail ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2.5">
                <Camera className="w-3.5 h-3.5 text-zinc-500 shrink-0 mt-0.5" />
                <Field label="Concept" value={thumbnail.concept} />
              </div>
              <Field label="Text overlay" value={thumbnail.textOverlay} />
              <Field label="Colours" value={thumbnail.colours} />
              <Field label="Composition" value={thumbnail.composition} />
              <Field label="Face / expression" value={thumbnail.faceExpression} />
            </div>
          ) : (
            <div className="flex items-start gap-2.5">
              <Camera className="w-3.5 h-3.5 text-zinc-500 shrink-0 mt-0.5" />
              <p className="text-[13px] text-zinc-200 leading-snug">
                {typeof thumbnail === "string" && hasText(thumbnail) ? thumbnail : brief.thumbnailDirection}
              </p>
            </div>
          )}
        </Card>
      ) : null}

      {/* Why this will work — data evidence */}
      {dataEvidence.length > 0 && (
        <div className="bg-[#0d0d10] border border-[#ff3040]/20 rounded-xl overflow-hidden shadow-[0_0_0_1px_rgba(255,48,64,0.05)]">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-[#1f1f22]">
            <BarChart3 className="w-3.5 h-3.5 text-[#ff3040]" />
            <p className="text-[10px] font-semibold text-[#ff3040] uppercase tracking-wider">Why This Will Work</p>
          </div>
          <div className="p-5 space-y-3">
            {dataEvidence.map((d, i) => (
              <div key={i} className="bg-[#111113] rounded-lg px-4 py-3 space-y-1.5">
                {hasText(d.claim) && (
                  <div className="flex items-start gap-2.5">
                    <span className="text-[#ff3040] font-mono text-[11px] shrink-0 mt-0.5 select-none">{i + 1}.</span>
                    <p className="text-[13px] text-zinc-200 leading-snug">{d.claim}</p>
                  </div>
                )}
                {hasText(d.evidence) && (
                  <div className="flex items-start gap-2.5 pl-[18px]">
                    <p className="text-[11px] text-zinc-500 font-mono leading-snug flex-1">{d.evidence}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* The prediction — visually distinct */}
      {hasText(brief.estimatedPerformance) && (
        <div className="bg-[#0d160f] border border-emerald-500/25 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-emerald-900/30">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">The Prediction</p>
          </div>
          <div className="p-5">
            <p className="text-[14px] text-zinc-100 leading-relaxed">{brief.estimatedPerformance}</p>
          </div>
        </div>
      )}
    </div>
  );
}
