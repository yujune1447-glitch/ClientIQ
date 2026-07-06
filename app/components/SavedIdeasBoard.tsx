"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, X, MessageSquare, Link2, TrendingUp, TrendingDown, Minus, Clock, Trash2 } from "lucide-react";

type Status = "to_make" | "in_progress" | "done";
type Verdict = "overperformed" | "on_par" | "underperformed" | "pending" | "not_posted";

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
  posted_video_id: string | null;
  posted_url: string | null;
  outcome_verdict: Verdict | null;
}

export interface RecentVideo {
  id: string;
  title: string;
  viewCount: number;
  publishedAt: string;
}

interface EditDraft {
  title: string;
  hook: string;
  length: string;
  structure: string;
  why_it_works: string;
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

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function toDraft(idea: SavedIdea): EditDraft {
  return {
    title: idea.title ?? "",
    hook: idea.hook ?? "",
    length: idea.length ?? "",
    structure: idea.structure ?? "",
    why_it_works: idea.why_it_works ?? "",
  };
}

export function SavedIdeasBoard({
  platform,
  onOpenChat,
  recentVideos = [],
}: {
  platform?: string;
  onOpenChat?: (platform: string) => void;
  recentVideos?: RecentVideo[];
}) {
  const [ideas, setIdeas] = useState<SavedIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  const [selectedIdea, setSelectedIdea] = useState<SavedIdea | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  const [captureIdea, setCaptureIdea] = useState<SavedIdea | null>(null);
  const [captureUrl, setCaptureUrl] = useState("");
  const [captureSaving, setCaptureSaving] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const captureBackdropRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (captureIdea) { setCaptureIdea(null); setCaptureUrl(""); setCaptureError(null); }
      else if (selectedIdea) closeModal();
    };
    if (selectedIdea || captureIdea) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedIdea, captureIdea]);

  const openModal = (idea: SavedIdea) => {
    setSelectedIdea(idea);
    setDraft(toDraft(idea));
    setModalError(null);
    setConfirmDelete(false);
  };

  const closeModal = () => {
    setSelectedIdea(null);
    setDraft(null);
    setModalError(null);
    setConfirmDelete(false);
  };

  const deleteIdea = async () => {
    if (!selectedIdea) return;
    setDeleting(true);
    setModalError(null);
    try {
      const res = await fetch(`/api/saved-ideas/${selectedIdea.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setIdeas((prev) => prev.filter((i) => i.id !== selectedIdea.id));
      closeModal();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Delete failed");
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) closeModal();
  };

  const saveModal = async () => {
    if (!selectedIdea || !draft) return;
    setModalSaving(true);
    setModalError(null);
    try {
      const res = await fetch(`/api/saved-ideas/${selectedIdea.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title || selectedIdea.title,
          hook: draft.hook || null,
          length: draft.length || null,
          structure: draft.structure || null,
          why_it_works: draft.why_it_works || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const { idea: updated } = await res.json();
      setIdeas((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      closeModal();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setModalSaving(false);
    }
  };

  const moveStatus = async (id: string, newStatus: Status, e: React.MouseEvent) => {
    e.stopPropagation();
    setMovingId(id);
    try {
      const res = await fetch(`/api/saved-ideas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error();
      setIdeas((prev) => prev.map((idea) => (idea.id === id ? { ...idea, status: newStatus } : idea)));
    } catch {
      // status unchanged on error
    } finally {
      setMovingId(null);
    }
  };

  const openCapture = (idea: SavedIdea) => {
    setCaptureIdea(idea);
    setCaptureUrl("");
    setCaptureError(null);
  };

  const closeCapture = () => {
    setCaptureIdea(null);
    setCaptureUrl("");
    setCaptureError(null);
  };

  const submitCapture = async (payload: { posted_url?: string; posted_video_id?: string; not_posted?: boolean }) => {
    if (!captureIdea) return;
    setCaptureSaving(true);
    setCaptureError(null);
    try {
      const res = await fetch(`/api/saved-ideas/${captureIdea.id}/outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const bodyJson = await res.json().catch(() => ({}));
      // On rejection (e.g. 422 not-on-channel) or failure: surface the error but
      // keep the popover + input open so the user can immediately try another URL.
      if (!res.ok) throw new Error(bodyJson.error ?? `HTTP ${res.status}`);
      setIdeas((prev) => prev.map((i) => (i.id === bodyJson.idea.id ? bodyJson.idea : i)));
      closeCapture();
    } catch (err) {
      setCaptureError(err instanceof Error ? err.message : "Capture failed");
    } finally {
      setCaptureSaving(false);
    }
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
        <button onClick={load} className="text-xs text-[#ff3040] hover:underline">Retry</button>
      </div>
    );
  }

  const byStatus = (s: Status) => ideas.filter((i) => i.status === s);

  return (
    <>
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="grid grid-cols-3 gap-4">
          {COLUMNS.map(({ key, label }) => (
            <div key={key} className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">{label}</p>
                <span className="text-[10px] font-mono text-zinc-700 bg-[#1a1a1d] rounded px-1.5 py-0.5">
                  {byStatus(key).length}
                </span>
              </div>

              <div className="flex flex-col gap-2 min-h-[120px]">
                {byStatus(key).map((idea) => {
                  const isMoving = movingId === idea.id;
                  return (
                    <div
                      key={idea.id}
                      className="bg-[#111113] border border-[#1f1f22] rounded-xl overflow-hidden"
                    >
                      <div
                        className="p-4 cursor-pointer hover:bg-[#161618] transition-colors select-none"
                        onClick={() => openModal(idea)}
                      >
                        <p className="text-[13px] font-medium text-white leading-snug mb-2">
                          {idea.title}
                        </p>

                        {!platform && (
                          <span
                            className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded capitalize ${
                              PLATFORM_COLORS[idea.platform] ?? "text-zinc-500 bg-zinc-500/10"
                            }`}
                          >
                            {idea.platform}
                          </span>
                        )}

                        {idea.hook && (
                          <p className="text-[11px] text-zinc-500 mt-2 leading-relaxed line-clamp-2">
                            {idea.hook}
                          </p>
                        )}
                      </div>

                      {key === "done" &&
                        (idea.posted_video_id ? (
                          // Linked → chip + re-link (never a dead-end) + View post.
                          <div className="border-t border-[#1f1f22] px-4 py-2 flex items-center gap-2">
                            <VerdictChip verdict={idea.outcome_verdict} />
                            <button
                              onClick={(e) => { e.stopPropagation(); openCapture(idea); }}
                              className="text-[10px] text-zinc-600 hover:text-zinc-300 transition-colors"
                            >
                              Re-link
                            </button>
                            {idea.posted_url && (
                              <a
                                href={idea.posted_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="ml-auto text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
                              >
                                View post ↗
                              </a>
                            )}
                          </div>
                        ) : (
                          // No valid link yet (unlinked, or marked not-posted) → keep the affordance.
                          <div className="w-full border-t border-[#1f1f22] px-4 py-2 flex items-center gap-2">
                            {idea.outcome_verdict === "not_posted" && <VerdictChip verdict="not_posted" />}
                            <button
                              onClick={(e) => { e.stopPropagation(); openCapture(idea); }}
                              className="flex items-center gap-1.5 text-left text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
                            >
                              <Link2 className="w-3 h-3 shrink-0" />
                              {idea.outcome_verdict === "not_posted" ? (
                                <span className="text-[#ff3040] font-medium">Actually, link it →</span>
                              ) : (
                                <span>Did you post this? <span className="text-[#ff3040] font-medium">Link it →</span></span>
                              )}
                            </button>
                          </div>
                        ))}

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
                              onClick={(e) => moveStatus(idea.id, "in_progress", e)}
                              disabled={isMoving}
                              className="text-[10px] text-zinc-500 hover:text-white disabled:opacity-40 transition-colors px-2 py-1 hover:bg-[#1f1f22] rounded"
                            >
                              {isMoving ? "…" : "Start →"}
                            </button>
                          )}
                          {key === "in_progress" && (
                            <>
                              <button
                                onClick={(e) => moveStatus(idea.id, "to_make", e)}
                                disabled={isMoving}
                                className="text-[10px] text-zinc-500 hover:text-zinc-300 disabled:opacity-40 transition-colors px-2 py-1 hover:bg-[#1f1f22] rounded"
                              >
                                ← Back
                              </button>
                              <button
                                onClick={(e) => moveStatus(idea.id, "done", e)}
                                disabled={isMoving}
                                className="text-[10px] text-emerald-600 hover:text-emerald-400 disabled:opacity-40 transition-colors px-2 py-1 hover:bg-emerald-950/40 rounded"
                              >
                                {isMoving ? "…" : "✓ Done"}
                              </button>
                            </>
                          )}
                          {key === "done" && (
                            <button
                              onClick={(e) => moveStatus(idea.id, "in_progress", e)}
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

      {/* ── Detail modal ── */}
      {selectedIdea && draft && (
        <div
          ref={backdropRef}
          onClick={handleBackdropClick}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-[#0f0f11] border border-[#27272a] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            {/* Header */}
            <div className="flex items-center gap-3 px-6 py-4 border-b border-[#1f1f22]">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded capitalize shrink-0 ${
                    PLATFORM_COLORS[selectedIdea.platform] ?? "text-zinc-500 bg-zinc-500/10"
                  }`}
                >
                  {selectedIdea.platform}
                </span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded shrink-0 ${
                    selectedIdea.source === "ai"
                      ? "text-blue-400 bg-blue-500/10"
                      : "text-amber-400 bg-amber-500/10"
                  }`}
                >
                  {selectedIdea.source === "ai" ? "AI" : "Manual"}
                </span>
              </div>
              <button
                onClick={closeModal}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-[#1c1c1f] transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-5">
              {/* Title */}
              <div>
                <label className="text-[9px] text-zinc-600 uppercase tracking-wider block mb-1.5">
                  Title
                </label>
                <textarea
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  className="w-full bg-[#111113] border border-[#27272a] rounded-xl px-3.5 py-2.5 text-[15px] font-semibold text-white focus:outline-none focus:border-[#ff3040]/50 resize-none transition-colors leading-snug"
                  rows={2}
                  style={{ fieldSizing: "content" } as React.CSSProperties}
                />
              </div>

              {/* Hook */}
              <div>
                <label className="text-[9px] text-zinc-600 uppercase tracking-wider block mb-1.5">
                  Hook
                </label>
                <textarea
                  value={draft.hook}
                  onChange={(e) => setDraft({ ...draft, hook: e.target.value })}
                  placeholder="No hook yet"
                  className="w-full bg-[#111113] border border-[#27272a] rounded-xl px-3.5 py-2.5 text-[13px] text-zinc-300 placeholder-zinc-700 focus:outline-none focus:border-[#ff3040]/50 resize-none transition-colors leading-relaxed"
                  rows={2}
                  style={{ fieldSizing: "content" } as React.CSSProperties}
                />
              </div>

              {/* Length */}
              <div>
                <label className="text-[9px] text-zinc-600 uppercase tracking-wider block mb-1.5">
                  Recommended Length
                </label>
                <input
                  type="text"
                  value={draft.length}
                  onChange={(e) => setDraft({ ...draft, length: e.target.value })}
                  placeholder="e.g. 8–12 minutes"
                  className="w-full bg-[#111113] border border-[#27272a] rounded-xl px-3.5 py-2.5 text-[13px] text-zinc-300 placeholder-zinc-700 focus:outline-none focus:border-[#ff3040]/50 transition-colors"
                />
              </div>

              {/* Outline */}
              <div>
                <label className="text-[9px] text-zinc-600 uppercase tracking-wider block mb-1.5">
                  Content Outline
                </label>
                <textarea
                  value={draft.structure}
                  onChange={(e) => setDraft({ ...draft, structure: e.target.value })}
                  placeholder="No outline yet"
                  className="w-full bg-[#111113] border border-[#27272a] rounded-xl px-3.5 py-2.5 text-[13px] text-zinc-300 placeholder-zinc-700 focus:outline-none focus:border-[#ff3040]/50 resize-none transition-colors leading-relaxed whitespace-pre-wrap font-mono"
                  rows={5}
                  style={{ fieldSizing: "content" } as React.CSSProperties}
                />
              </div>

              {/* Why it'll work */}
              <div>
                <label className="text-[9px] text-zinc-600 uppercase tracking-wider block mb-1.5">
                  Why it&apos;ll work
                </label>
                <textarea
                  value={draft.why_it_works}
                  onChange={(e) => setDraft({ ...draft, why_it_works: e.target.value })}
                  placeholder="No reasoning yet"
                  className="w-full bg-[#111113] border border-[#27272a] rounded-xl px-3.5 py-2.5 text-[13px] text-zinc-300 placeholder-zinc-700 focus:outline-none focus:border-[#ff3040]/50 resize-none transition-colors leading-relaxed"
                  rows={3}
                  style={{ fieldSizing: "content" } as React.CSSProperties}
                />
              </div>

              {modalError && (
                <p className="text-xs text-red-400">{modalError}</p>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[#1f1f22] flex items-center justify-between gap-3">
              <div className="flex items-center gap-1">
                {onOpenChat && (
                  <button
                    onClick={() => {
                      onOpenChat(selectedIdea.platform);
                      closeModal();
                    }}
                    className="flex items-center gap-1.5 text-[12px] text-zinc-500 hover:text-zinc-200 px-3 py-1.5 rounded-lg hover:bg-[#1c1c1f] transition-colors"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Open in AI Chat
                  </button>
                )}
                {confirmDelete ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12px] text-zinc-400">Delete this idea?</span>
                    <button
                      onClick={deleteIdea}
                      disabled={deleting}
                      className="flex items-center gap-1.5 text-[12px] font-medium text-red-400 hover:text-red-300 px-2.5 py-1.5 rounded-lg hover:bg-red-950/40 disabled:opacity-50 transition-colors"
                    >
                      {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      {deleting ? "Deleting…" : "Confirm"}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      disabled={deleting}
                      className="text-[12px] text-zinc-500 hover:text-zinc-300 px-2.5 py-1.5 rounded-lg hover:bg-[#1c1c1f] disabled:opacity-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    title="Delete idea"
                    className="flex items-center justify-center w-8 h-8 text-zinc-600 hover:text-red-400 rounded-lg hover:bg-red-950/30 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={closeModal}
                  className="px-4 py-1.5 rounded-lg text-[13px] text-zinc-400 hover:text-white hover:bg-[#1c1c1f] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveModal}
                  disabled={modalSaving}
                  className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-[#ff3040] hover:bg-[#e02030] disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors flex items-center gap-1.5"
                >
                  {modalSaving && <Loader2 className="w-3 h-3 animate-spin" />}
                  {modalSaving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Capture popover: link a Done idea to a real posted video ── */}
      {captureIdea && (
        <div
          ref={captureBackdropRef}
          onClick={(e) => { if (e.target === captureBackdropRef.current) closeCapture(); }}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-[#0f0f11] border border-[#27272a] rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-[#1f1f22]">
              <Link2 className="w-3.5 h-3.5 text-[#ff3040]" />
              <p className="text-[13px] font-semibold flex-1">Link this idea to a post</p>
              <button
                onClick={closeCapture}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-[#1c1c1f] transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="px-5 py-5 space-y-5">
              <p className="text-[12px] text-zinc-500 leading-relaxed line-clamp-2">
                {captureIdea.title}
              </p>

              {/* Paste URL */}
              <div>
                <label className="text-[9px] text-zinc-600 uppercase tracking-wider block mb-1.5">
                  Paste the YouTube URL
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={captureUrl}
                    onChange={(e) => setCaptureUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && captureUrl.trim() && !captureSaving) submitCapture({ posted_url: captureUrl }); }}
                    placeholder="https://youtube.com/watch?v=…"
                    autoFocus
                    className="flex-1 bg-[#111113] border border-[#27272a] rounded-xl px-3.5 py-2.5 text-[13px] text-zinc-300 placeholder-zinc-700 focus:outline-none focus:border-[#ff3040]/50 transition-colors"
                  />
                  <button
                    onClick={() => submitCapture({ posted_url: captureUrl })}
                    disabled={captureSaving || !captureUrl.trim()}
                    className="px-3.5 py-2.5 rounded-xl text-[13px] font-medium bg-[#ff3040] hover:bg-[#e02030] disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors flex items-center gap-1.5"
                  >
                    {captureSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Link"}
                  </button>
                </div>
              </div>

              {/* Pick from recent uploads (from cached summary.allVideos — zero fetch) */}
              {recentVideos.length > 0 && (
                <div>
                  <label className="text-[9px] text-zinc-600 uppercase tracking-wider block mb-1.5">
                    …or pick from your recent uploads
                  </label>
                  <div className="max-h-48 overflow-y-auto space-y-1 border border-[#27272a] rounded-xl p-1.5">
                    {recentVideos.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => submitCapture({ posted_video_id: v.id })}
                        disabled={captureSaving}
                        className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-[#161618] disabled:opacity-40 transition-colors flex items-center gap-2"
                      >
                        <span className="text-[12px] text-zinc-300 truncate flex-1">{v.title}</span>
                        <span className="text-[10px] text-zinc-600 tabular-nums shrink-0">{fmt(v.viewCount)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Rejection/failure stays inline — input above remains open for a retry. */}
              {captureError && <p className="text-xs text-red-400 leading-relaxed">{captureError}</p>}
            </div>

            <div className="px-5 py-3.5 border-t border-[#1f1f22] flex items-center justify-between">
              <button
                onClick={() => submitCapture({ not_posted: true })}
                disabled={captureSaving}
                className="text-[12px] text-zinc-600 hover:text-zinc-400 disabled:opacity-40 transition-colors"
              >
                I didn&apos;t make this
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function VerdictChip({ verdict }: { verdict: Verdict | null }) {
  if (!verdict) return null;
  const map: Record<Verdict, { label: string; cls: string; icon: React.ReactNode }> = {
    overperformed: { label: "Overperformed", cls: "text-emerald-400 bg-emerald-500/10", icon: <TrendingUp className="w-3 h-3" /> },
    on_par: { label: "On par", cls: "text-zinc-300 bg-zinc-500/10", icon: <Minus className="w-3 h-3" /> },
    underperformed: { label: "Underperformed", cls: "text-red-400 bg-red-500/10", icon: <TrendingDown className="w-3 h-3" /> },
    pending: { label: "Pending", cls: "text-amber-400 bg-amber-500/10", icon: <Clock className="w-3 h-3" /> },
    not_posted: { label: "Not posted", cls: "text-zinc-600 bg-zinc-500/10", icon: <Minus className="w-3 h-3" /> },
  };
  const v = map[verdict];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${v.cls}`}>
      {v.icon}
      {v.label}
    </span>
  );
}
