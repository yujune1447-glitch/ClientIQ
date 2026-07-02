"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, ChevronRight } from "lucide-react";

type Status = "to_make" | "in_progress" | "done";

interface SavedIdea {
  id: string;
  platform: string;
  title: string;
  hook: string | null;
  length: string | null;
  structure: string | null;
  why_it_works: string | null;
  status: Status;
  source: "ai" | "manual";
  created_at: string;
}

const COLUMNS: { key: Status; label: string }[] = [
  { key: "to_make", label: "To Make" },
  { key: "in_progress", label: "In Progress" },
  { key: "done", label: "Done" },
];

const PLATFORM_COLORS: Record<string, string> = {
  youtube: "text-red-400 bg-red-500/10",
  instagram: "text-purple-400 bg-purple-500/10",
  tiktok: "text-cyan-400 bg-cyan-500/10",
};

export function SavedIdeasBoard({ platform }: { platform?: string }) {
  const [ideas, setIdeas] = useState<SavedIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    setErrorMsg(null);
    try {
      const url = platform ? `/api/saved-ideas?platform=${platform}` : "/api/saved-ideas";
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const { ideas: data } = await res.json();
      setIdeas(data ?? []);
    } catch (err) {
      setError(true);
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [platform]);

  useEffect(() => {
    load();
  }, [load]);

  const moveStatus = async (id: string, newStatus: Status) => {
    setMovingId(id);
    try {
      const res = await fetch(`/api/saved-ideas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error();
      setIdeas((prev) =>
        prev.map((idea) => (idea.id === id ? { ...idea, status: newStatus } : idea))
      );
    } catch {
      // status unchanged on error
    } finally {
      setMovingId(null);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-zinc-500">
        <Loader2 className="w-4 h-4 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center py-24 gap-3">
        <p className="text-sm text-zinc-500">Failed to load ideas.</p>
        {errorMsg && <p className="text-xs text-zinc-700 font-mono">{errorMsg}</p>}
        <button onClick={load} className="text-xs text-[#ff3040] hover:underline">
          Retry
        </button>
      </div>
    );
  }

  const byStatus = (s: Status) => ideas.filter((i) => i.status === s);

  return (
    <div className="max-w-6xl mx-auto px-6 py-6">
      <div className="grid grid-cols-3 gap-4">
        {COLUMNS.map(({ key, label }) => (
          <div key={key} className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                {label}
              </p>
              <span className="text-[10px] font-mono text-zinc-700 bg-[#1a1a1d] rounded px-1.5 py-0.5">
                {byStatus(key).length}
              </span>
            </div>

            <div className="flex flex-col gap-2 min-h-[120px]">
              {byStatus(key).map((idea) => {
                const isMoving = movingId === idea.id;
                const isExpanded = expandedIds.has(idea.id);
                return (
                  <div
                    key={idea.id}
                    className="bg-[#111113] border border-[#1f1f22] rounded-xl overflow-hidden"
                  >
                    <div
                      className="p-4 cursor-pointer hover:bg-[#161618] transition-colors select-none"
                      onClick={() => toggleExpand(idea.id)}
                    >
                      <div className="flex items-start gap-2 mb-2">
                        <p className="text-[13px] font-medium text-white leading-snug flex-1">
                          {idea.title}
                        </p>
                        <ChevronRight
                          className={`w-3.5 h-3.5 text-zinc-600 shrink-0 mt-0.5 transition-transform ${
                            isExpanded ? "rotate-90" : ""
                          }`}
                        />
                      </div>

                      {!platform && (
                        <span
                          className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded capitalize ${
                            PLATFORM_COLORS[idea.platform] ?? "text-zinc-500 bg-zinc-500/10"
                          }`}
                        >
                          {idea.platform}
                        </span>
                      )}

                      {idea.hook && !isExpanded && (
                        <p className="text-[11px] text-zinc-500 mt-2 leading-relaxed line-clamp-2">
                          {idea.hook}
                        </p>
                      )}
                    </div>

                    {isExpanded && (
                      <div className="border-t border-[#1f1f22] px-4 py-3 space-y-2.5 bg-[#0d0d0f]">
                        {idea.hook && (
                          <div>
                            <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-1">
                              Hook
                            </p>
                            <p className="text-[11px] text-zinc-400 leading-relaxed">{idea.hook}</p>
                          </div>
                        )}
                        {idea.length && (
                          <div>
                            <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-1">
                              Length
                            </p>
                            <p className="text-[11px] text-zinc-400">{idea.length}</p>
                          </div>
                        )}
                        {idea.structure && (
                          <div>
                            <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-1">
                              Outline
                            </p>
                            <p className="text-[11px] text-zinc-400 leading-relaxed whitespace-pre-wrap">
                              {idea.structure}
                            </p>
                          </div>
                        )}
                        {idea.why_it_works && (
                          <div>
                            <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-1">
                              Why it&apos;ll work
                            </p>
                            <p className="text-[11px] text-zinc-400 leading-relaxed">
                              {idea.why_it_works}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="border-t border-[#1f1f22] px-4 py-2 flex items-center justify-between">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded ${
                          idea.source === "ai"
                            ? "text-blue-400 bg-blue-500/10"
                            : "text-amber-400 bg-amber-500/10"
                        }`}
                      >
                        {idea.source === "ai" ? "AI" : "Manual"}
                      </span>

                      <div className="flex items-center gap-1">
                        {key === "to_make" && (
                          <button
                            onClick={() => moveStatus(idea.id, "in_progress")}
                            disabled={isMoving}
                            className="text-[10px] text-zinc-500 hover:text-white disabled:opacity-40 transition-colors px-2 py-1 hover:bg-[#1f1f22] rounded"
                          >
                            {isMoving ? "…" : "Start →"}
                          </button>
                        )}
                        {key === "in_progress" && (
                          <>
                            <button
                              onClick={() => moveStatus(idea.id, "to_make")}
                              disabled={isMoving}
                              className="text-[10px] text-zinc-500 hover:text-zinc-300 disabled:opacity-40 transition-colors px-2 py-1 hover:bg-[#1f1f22] rounded"
                            >
                              ← Back
                            </button>
                            <button
                              onClick={() => moveStatus(idea.id, "done")}
                              disabled={isMoving}
                              className="text-[10px] text-emerald-600 hover:text-emerald-400 disabled:opacity-40 transition-colors px-2 py-1 hover:bg-emerald-950/40 rounded"
                            >
                              {isMoving ? "…" : "✓ Done"}
                            </button>
                          </>
                        )}
                        {key === "done" && (
                          <button
                            onClick={() => moveStatus(idea.id, "in_progress")}
                            disabled={isMoving}
                            className="text-[10px] text-zinc-600 hover:text-zinc-400 disabled:opacity-40 transition-colors px-2 py-1 hover:bg-[#1f1f22] rounded"
                          >
                            {isMoving ? "…" : "← Reopen"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {byStatus(key).length === 0 && (
                <div className="border border-dashed border-[#27272a] rounded-xl p-6 text-center">
                  <p className="text-[11px] text-zinc-700">No ideas here</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
