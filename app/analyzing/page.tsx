"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Zap, CheckCircle, Loader2, PlayCircle, AlertCircle, Minus, Eye, Database } from "lucide-react";

type StepStatus = "pending" | "active" | "complete" | "skipped";

const STEPS = [
  { id: "connect", label: "Connected to YouTube", sublabel: "OAuth verified" },
  { id: "pull", label: "Pulling channel history", sublabel: "Fetching all videos and metadata" },
  { id: "analytics", label: "Fetching analytics data", sublabel: "Views, CTR, retention per video" },
  { id: "instagram", label: "Pulling Instagram data", sublabel: "Fetching posts, engagement, reach and insights" },
  { id: "tiktok", label: "Pulling TikTok data", sublabel: "Fetching videos, views, engagement and comments" },
  { id: "process", label: "Processing performance data", sublabel: "Calculating channel averages and scores" },
  { id: "rank", label: "Analysing top & bottom performers", sublabel: "Fetching comments from key videos" },
  { id: "comments_intel", label: "Analysing audience comments", sublabel: "Clustering themes, surfacing ideas, mapping emotional signals" },
  { id: "synthesis", label: "Synthesising channel intelligence", sublabel: "Connecting patterns across all six analysis layers" },
  { id: "save", label: "Generating your brief", sublabel: "Claude is combining all intelligence" },
];

const STREAMING_STEPS = new Set(["comments_intel", "synthesis", "save"]);

function isQuotaError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return lower.includes("quota") || lower.includes("daily limit") || lower.includes("ratelimitexceeded");
}

function AnalyzingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reanalyze = searchParams.get("reanalyze") === "1";

  const [statuses, setStatuses] = useState<Record<string, StepStatus>>({ connect: "active" });
  const [streamChars, setStreamChars] = useState<Record<string, number>>({});
  const [stepMs, setStepMs] = useState<Record<string, number>>({});
  const [videoCount, setVideoCount] = useState(0);
  const [detailsProgress, setDetailsProgress] = useState({ current: 0, total: 0 });
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestAnalysisId, setLatestAnalysisId] = useState<string | null>(null);
  const [recomputing, setRecomputing] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!reanalyze) {
        try {
          const res = await fetch("/api/analysis/latest");
          if (!cancelled && res.ok) {
            const data = await res.json();
            if (data?.id) {
              router.replace(`/workspace?analysis=${data.id}`);
              return;
            }
          }
        } catch {}
      }

      if (cancelled) return;

      // Pre-fetch latest analysis ID for error recovery while analysis runs
      fetch("/api/analysis/latest")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d?.id && !cancelled) setLatestAnalysisId(d.id); })
        .catch(() => {});

      const source = new EventSource("/api/analyze");
      sourceRef.current = source;

      source.onmessage = (e: MessageEvent) => {
        if (cancelled) return;
        const msg = JSON.parse(e.data) as Record<string, unknown>;

        switch (msg.event) {
          case "step_start":
            setStatuses((prev) => ({ ...prev, [msg.step as string]: "active" }));
            break;
          case "step_done":
            setStatuses((prev) => ({ ...prev, [msg.step as string]: "complete" }));
            if (typeof msg.ms === "number") {
              setStepMs((prev) => ({ ...prev, [msg.step as string]: msg.ms as number }));
            }
            break;
          case "stream_progress":
            setStreamChars((prev) => ({ ...prev, [msg.step as string]: msg.chars as number }));
            break;
          case "step_skip":
            setStatuses((prev) => ({ ...prev, [msg.step as string]: "skipped" }));
            break;
          case "videos_found":
            setVideoCount(msg.count as number);
            break;
          case "details_progress":
            setDetailsProgress({ current: msg.current as number, total: msg.total as number });
            break;
          case "complete": {
            setStatuses((prev) =>
              Object.fromEntries(
                STEPS.map((s) => [s.id, prev[s.id] === "skipped" ? "skipped" : "complete"])
              )
            );
            setDone(true);
            source.close();
            const analysisId = msg.analysisId as string;
            if (analysisId) {
              router.push(`/analysis/${analysisId}`);
            }
            break;
          }
          case "error":
            if (msg.message === "needs_reauth") {
              source.close();
              router.replace("/api/auth/youtube");
            } else {
              setError(msg.message as string);
              source.close();
            }
            break;
        }
      };

      source.onerror = () => {
        if (!cancelled) setError("Connection lost. Please try again.");
        source.close();
      };
    }

    init();

    return () => {
      cancelled = true;
      sourceRef.current?.close();
    };
  }, [router, reanalyze]);

  const handleRecompute = async () => {
    if (recomputing) return;
    setRecomputing(true);
    try {
      const res = await fetch("/api/analyze/recompute", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        router.push(`/workspace?analysis=${data.analysisId}`);
      } else if (data.error === "no_cache") {
        setError("No cached data found. Run a full analysis first.");
      } else {
        setError("Recompute failed. Please try again.");
      }
    } catch {
      setError("Recompute failed. Please try again.");
    } finally {
      setRecomputing(false);
    }
  };

  const goToLastAnalysis = () => {
    router.push(latestAnalysisId ? `/workspace?analysis=${latestAnalysisId}` : "/workspace");
  };

  const quotaError = error ? isQuotaError(error) : false;
  const statusOf = (id: string): StepStatus => statuses[id] ?? "pending";
  const activeStep = STEPS.find((s) => statusOf(s.id) === "active");
  const processedPct =
    detailsProgress.total > 0
      ? Math.round((detailsProgress.current / detailsProgress.total) * 100)
      : 0;

  return (
    <div className="min-h-screen bg-[#09090b] text-white flex flex-col">
      <nav className="border-b border-[#1f1f22] px-6 py-4 flex items-center gap-2 max-w-7xl mx-auto w-full">
        <a href="/workspace" title="Go to Overview" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <div className="w-7 h-7 bg-[#ff3040] rounded-md flex items-center justify-center">
            <Zap className="w-4 h-4 text-white fill-white" />
          </div>
          <span className="font-semibold text-[15px] tracking-tight">CreatorIQ</span>
        </a>
        <a
          href="/workspace"
          className="ml-auto text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          ← Back to workspace
        </a>
      </nav>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-lg">
          <div className="flex items-center gap-3 bg-[#111113] border border-[#1f1f22] rounded-xl px-4 py-3 mb-10">
            <div className="w-9 h-9 rounded-full bg-[#ff3040] flex items-center justify-center shrink-0">
              <PlayCircle className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-medium">Your YouTube Channel</p>
              <p className="text-xs text-zinc-500">Authorised · Read-only access</p>
            </div>
            <CheckCircle className="w-4 h-4 text-emerald-500 ml-auto shrink-0" />
          </div>

          {error ? (
            <div className="mb-6 space-y-4">
              <div className="flex items-start gap-3 bg-[#1a0f0f] border border-red-900/40 rounded-xl p-5">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-400">
                    {quotaError ? "YouTube daily quota reached" : "Analysis failed"}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">
                    {quotaError
                      ? "YouTube daily quota reached — your cached analysis is still available."
                      : error}
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={goToLastAnalysis}
                  className="flex-1 flex items-center justify-center gap-2 bg-[#111113] border border-[#1f1f22] hover:border-zinc-600 rounded-xl px-4 py-3 text-sm font-medium transition-colors"
                >
                  <Eye className="w-4 h-4" />
                  View last analysis
                </button>
                <button
                  onClick={handleRecompute}
                  disabled={recomputing}
                  className="flex-1 flex items-center justify-center gap-2 bg-[#ff3040] hover:bg-[#e02030] disabled:opacity-40 disabled:cursor-not-allowed rounded-xl px-4 py-3 text-sm font-medium transition-colors"
                >
                  {recomputing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Database className="w-4 h-4" />
                  )}
                  {recomputing ? "Recomputing…" : "Recompute from cache"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold tracking-tight mb-1">
                {done ? "Analysis complete." : "Analysing your channel..."}
              </h1>
              <p className="text-sm text-zinc-500 mb-10">
                {done
                  ? "Redirecting to your content brief..."
                  : activeStep
                  ? activeStep.sublabel
                  : "Preparing..."}
              </p>
            </>
          )}

          <div className="space-y-2.5 mb-10">
            {STEPS.map((step) => {
              const status = statusOf(step.id);
              return (
                <div
                  key={step.id}
                  className={`flex items-start gap-3 p-3.5 rounded-lg border transition-all duration-300 ${
                    status === "active"
                      ? "bg-[#1a1014] border-[#ff3040]/30"
                      : status === "complete"
                      ? "bg-[#111113] border-[#1f1f22]"
                      : status === "skipped"
                      ? "bg-[#0d0d0f] border-[#1a1a1d] opacity-50"
                      : "border-transparent opacity-30"
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    {status === "complete" ? (
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                    ) : status === "skipped" ? (
                      <Minus className="w-4 h-4 text-zinc-600" />
                    ) : status === "active" ? (
                      <Loader2 className="w-4 h-4 text-[#ff3040] animate-spin" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-zinc-700" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-medium ${
                        status === "pending" || status === "skipped" ? "text-zinc-600" : "text-white"
                      }`}
                    >
                      {step.label}
                    </p>
                    {status === "skipped" && (
                      <p className="text-xs text-zinc-700 mt-0.5">Not connected — skipped</p>
                    )}
                    {status !== "pending" && status !== "skipped" && (
                      <p className="text-xs text-zinc-500 mt-0.5">{step.sublabel}</p>
                    )}
                    {status === "active" && STREAMING_STEPS.has(step.id) && (
                      <p className="text-xs text-[#ff3040] mt-1 tabular-nums">
                        {streamChars[step.id]
                          ? `Claude is writing… ${streamChars[step.id].toLocaleString()} characters`
                          : "Claude is thinking…"}
                      </p>
                    )}
                    {status === "complete" && stepMs[step.id] != null && (
                      <p className="text-[11px] text-zinc-600 mt-0.5 tabular-nums">
                        Done in {(stepMs[step.id] / 1000).toFixed(1)}s
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Videos found", value: videoCount > 0 ? videoCount.toLocaleString() : "—" },
              { label: "Details fetched", value: detailsProgress.total > 0 ? `${processedPct}%` : "—" },
              { label: "Status", value: error ? "Error" : done ? "Done" : "Running" },
            ].map((stat) => (
              <div key={stat.label} className="bg-[#111113] border border-[#1f1f22] rounded-lg p-3 text-center">
                <p className="text-lg font-bold tabular-nums">{stat.value}</p>
                <p className="text-[11px] text-zinc-600 mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function AnalyzingPage() {
  return (
    <Suspense>
      <AnalyzingContent />
    </Suspense>
  );
}
