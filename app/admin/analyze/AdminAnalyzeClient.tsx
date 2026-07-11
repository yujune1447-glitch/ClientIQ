"use client";

import { useState } from "react";
import { Search, Loader2, AlertCircle, Sparkles, TrendingUp } from "lucide-react";

interface Result {
  channel: { title: string; handle: string; subscriberCount: number; thumbnail: string; videoCount: number };
  videosAnalysed: number;
  dateRange: { from: string; to: string };
  medianViews: number;
  topVideos: { title: string; views: number; publishedAt: string }[];
  signals: string[];
  findings: string[];
  nextVideoAngle: string;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function AdminAnalyzeClient() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const run = async () => {
    if (!input.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: input.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");
      setResult(data as Result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="flex items-center gap-2 mb-1">
          <Search className="w-5 h-5 text-[#ff3040]" />
          <h1 className="text-xl font-bold tracking-tight">Channel Light-Analysis</h1>
          <span className="text-[10px] uppercase tracking-widest text-zinc-600 border border-[#27272a] rounded-full px-2 py-0.5">Internal</span>
        </div>
        <p className="text-sm text-zinc-500 mb-8">
          Analyse any channel from public data (no OAuth) for outreach. Paste a handle or URL.
        </p>

        <div className="flex gap-2 mb-8">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") run(); }}
            placeholder="@mkbhd  ·  youtube.com/@veritasium  ·  channel URL"
            className="flex-1 bg-[#111113] border border-[#1f1f22] rounded-xl px-4 py-3 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
          />
          <button
            onClick={run}
            disabled={loading || !input.trim()}
            className="flex items-center gap-2 bg-[#ff3040] hover:bg-[#e02030] disabled:opacity-40 disabled:cursor-not-allowed rounded-xl px-5 py-3 text-sm font-medium transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? "Analysing…" : "Analyse"}
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-3 bg-[#1a0f0f] border border-red-900/40 rounded-xl p-4 mb-8">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {result && (
          <div className="space-y-8">
            <div className="flex items-center gap-3 bg-[#111113] border border-[#1f1f22] rounded-xl p-4">
              {result.channel.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={result.channel.thumbnail} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-[#ff3040]/20 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{result.channel.title}</p>
                <p className="text-xs text-zinc-500">
                  {result.channel.handle ? `@${result.channel.handle} · ` : ""}
                  {fmt(result.channel.subscriberCount)} subs · {fmt(result.medianViews)} median views ·{" "}
                  {result.videosAnalysed} recent videos
                </p>
              </div>
            </div>

            <section>
              <h2 className="text-xs uppercase tracking-widest text-zinc-500 font-medium mb-3">Findings</h2>
              <ul className="space-y-2.5">
                {result.findings.map((f, i) => (
                  <li key={i} className="flex items-start gap-3 bg-[#111113] border border-[#1f1f22] rounded-lg p-3.5">
                    <span className="text-[#ff3040] text-sm font-bold shrink-0">{i + 1}</span>
                    <p className="text-sm text-zinc-200 leading-relaxed">{f}</p>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="text-xs uppercase tracking-widest text-zinc-500 font-medium mb-3">Next-video angle</h2>
              <div className="flex items-start gap-3 bg-[#1a1014] border border-[#ff3040]/30 rounded-lg p-4">
                <TrendingUp className="w-4 h-4 text-[#ff3040] shrink-0 mt-0.5" />
                <p className="text-sm text-zinc-100 leading-relaxed">{result.nextVideoAngle}</p>
              </div>
            </section>

            {result.signals.length > 0 && (
              <section>
                <h2 className="text-xs uppercase tracking-widest text-zinc-500 font-medium mb-3">Underlying signals</h2>
                <ul className="space-y-1.5">
                  {result.signals.map((s, i) => (
                    <li key={i} className="text-xs text-zinc-500 leading-relaxed">• {s}</li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h2 className="text-xs uppercase tracking-widest text-zinc-500 font-medium mb-3">Top videos</h2>
              <ul className="space-y-1.5">
                {result.topVideos.map((v, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm">
                    <span className="text-zinc-600 tabular-nums w-6 shrink-0">{i + 1}.</span>
                    <span className="text-zinc-300 truncate flex-1">{v.title}</span>
                    <span className="text-zinc-500 tabular-nums shrink-0">{fmt(v.views)}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
