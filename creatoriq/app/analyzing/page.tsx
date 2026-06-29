"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, CheckCircle, Loader2, PlayCircle, AlertCircle } from "lucide-react";

type StepStatus = "pending" | "active" | "complete";

const STEPS = [
  { id: "connect", label: "Connected to YouTube", sublabel: "OAuth verified" },
  { id: "pull", label: "Pulling channel history", sublabel: "Fetching all videos and metadata" },
  { id: "analytics", label: "Fetching analytics data", sublabel: "Views, CTR, retention per video" },
  { id: "process", label: "Processing performance data", sublabel: "Calculating channel averages and scores" },
  { id: "rank", label: "Analysing top & bottom performers", sublabel: "Fetching comments from key videos" },
  { id: "save", label: "Preparing your brief", sublabel: "Compressing summary for AI analysis" },
];

export default function AnalyzingPage() {
  const router = useRouter();
  const [statuses, setStatuses] = useState<Record<string, StepStatus>>({ connect: "active" });
  const [videoCount, setVideoCount] = useState(0);
  const [detailsProgress, setDetailsProgress] = useState({ current: 0, total: 0 });
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const source = new EventSource("/api/analyze");
    sourceRef.current = source;

    source.onmessage = (e: MessageEvent) => {
      const msg = JSON.parse(e.data) as Record<string, unknown>;

      switch (msg.event) {
        case "step_start":
          setStatuses((prev) => ({ ...prev, [msg.step as string]: "active" }));
          break;
        case "step_done":
          setStatuses((prev) => ({ ...prev, [msg.step as string]: "complete" }));
          break;
        case "videos_found":
          setVideoCount(msg.count as number);
          break;
        case "details_progress":
          setDetailsProgress({ current: msg.current as number, total: msg.total as number });
          break;
        case "complete":
          setStatuses(() => Object.fromEntries(STEPS.map((s) => [s.id, "complete"])));
          setDone(true);
          source.close();
          router.push(`/dashboard?id=${msg.analysisId}`);
          break;
        case "error":
          setError(msg.message as string);
          source.close();
          break;
      }
    };

    source.onerror = () => {
      setError("Connection lost. Please try again.");
      source.close();
    };

    return () => source.close();
  }, [router]);

  const statusOf = (id: string): StepStatus => statuses[id] ?? "pending";

  const activeStep = STEPS.find((s) => statusOf(s.id) === "active");
  const processedPct =
    detailsProgress.total > 0
      ? Math.round((detailsProgress.current / detailsProgress.total) * 100)
      : 0;

  return (
    <div className="min-h-screen bg-[#09090b] text-white flex flex-col">
      <nav className="border-b border-[#1f1f22] px-6 py-4 flex items-center gap-2 max-w-7xl mx-auto w-full">
        <div className="w-7 h-7 bg-[#ff3040] rounded-md flex items-center justify-center">
          <Zap className="w-4 h-4 text-white fill-white" />
        </div>
        <span className="font-semibold text-[15px] tracking-tight">CreatorIQ</span>
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
            <div className="flex items-start gap-3 bg-[#1a0f0f] border border-red-900/40 rounded-xl p-5 mb-6">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-400">Analysis failed</p>
                <p className="text-xs text-zinc-500 mt-1">{error}</p>
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold tracking-tight mb-1">
                {done ? "Analysis complete." : "Analysing your channel..."}
              </h1>
              <p className="text-sm text-zinc-500 mb-10">
                {done
                  ? "Redirecting to your dashboard..."
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
                      : "border-transparent opacity-30"
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    {status === "complete" ? (
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                    ) : status === "active" ? (
                      <Loader2 className="w-4 h-4 text-[#ff3040] animate-spin" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-zinc-700" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${status === "pending" ? "text-zinc-600" : "text-white"}`}>
                      {step.label}
                    </p>
                    {status !== "pending" && (
                      <p className="text-xs text-zinc-500 mt-0.5">{step.sublabel}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              {
                label: "Videos found",
                value: videoCount > 0 ? videoCount.toLocaleString() : "—",
              },
              {
                label: "Details fetched",
                value: detailsProgress.total > 0 ? `${processedPct}%` : "—",
              },
              {
                label: "Status",
                value: error ? "Error" : done ? "Done" : "Running",
              },
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
