"use client";

import { useState, useEffect, useRef } from "react";
import {
  Zap, PlayCircle, Camera, Music2, LayoutDashboard,
  MessageSquare, ChevronDown, ChevronRight, AlertCircle,
  Send, Loader2, X, Sparkles, Plus, Settings, Lightbulb, RefreshCw, Database,
} from "lucide-react";
import { AnalysisContent, type AnalysisData } from "@/app/components/AnalysisContent";
import { DashboardView } from "@/app/components/DashboardView";
import { SavedIdeasBoard } from "@/app/components/SavedIdeasBoard";
import { useChatStream, type ChatMsg } from "@/app/hooks/useChatStream";
import type { ChannelSnapshot } from "@/types";

type AccountType = "youtube" | "instagram" | "tiktok";
type MainView = "dashboard" | "saved-ideas" | AccountType;

interface StoredConversation {
  id: string;
  title: string;
  accountType: AccountType;
  createdAt: string;
  lastMessage: string;
  messages: ChatMsg[];
}

interface SidebarAnalysis {
  id: string;
  createdAt: string;
  channelTitle: string;
  isUnread: boolean;
  isScheduled: boolean;
}

interface YtConn {
  channelTitle: string;
  channelThumbnail: string | null;
  channelHandle: string | null;
  channelId: string;
}
interface IgConn {
  username: string;
  profilePictureUrl: string | null;
}
interface TtConn {
  displayName: string;
  avatarUrl: string | null;
}

interface Props {
  initialView?: MainView;
  sidebarAnalyses: SidebarAnalysis[];
  selectedAnalysisId: string | null;
  selectedAnalysis: AnalysisData | null;
  ytConn: YtConn | null;
  igConn: IgConn | null;
  ttConn: TtConn | null;
  snapshots: ChannelSnapshot[];
  instagramError?: string;
  tiktokError?: string;
}

const LS_KEY = "creatoriq_conversations_v2";

const INIT_PROMPT =
  "Please give me a concise performance rundown of my channel. Highlight the key changes since my last check-in — wins, concerns, any metric shifts — grounded in actual numbers from my data. Then end with exactly 2 follow-up questions tailored specifically to what you found.";

function loadConversations(): StoredConversation[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveConversations(convs: StoredConversation[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(convs.slice(0, 50)));
  } catch {}
}

export default function WorkspaceShell({
  initialView,
  selectedAnalysisId,
  selectedAnalysis,
  ytConn,
  igConn,
  ttConn,
  snapshots,
  instagramError,
  tiktokError,
}: Props) {
  const [mainView, setMainView] = useState<MainView>(initialView ?? "dashboard");
  const [conversations, setConversations] = useState<StoredConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [convosExpanded, setConvosExpanded] = useState(false);
  const [expandedPlatforms, setExpandedPlatforms] = useState<Record<AccountType, boolean>>({
    youtube: true,
    instagram: true,
    tiktok: true,
  });
  const [clientAnalysis, setClientAnalysis] = useState<AnalysisData | null>(null);
  const [recomputing, setRecomputing] = useState(false);

  const effectiveAnalysis = selectedAnalysis ?? clientAnalysis;
  const effectiveAnalysisId = effectiveAnalysis?.id ?? selectedAnalysisId;

  const { messages, setMessages, loading: aiLoading, append, reset } = useChatStream(
    effectiveAnalysisId ?? undefined
  );

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const fetchLatestAnalysis = async () => {
    try {
      const res = await fetch("/api/analysis/latest");
      if (!res.ok) return;
      const raw = await res.json();
      if (!raw) return;
      setClientAnalysis({
        id: raw.id,
        createdAt: raw.created_at,
        summary: raw.summary,
        brief: raw.brief ?? null,
        autopsy: raw.autopsy ?? null,
        igSummary: raw.instagram_summary ?? null,
        tikTokSummary: raw.tiktok_summary ?? null,
        commentIntel: raw.comment_intelligence ?? null,
        isUnread: raw.is_unread === true,
        isScheduled: raw.generated_by === "scheduled",
      });
    } catch {
      // non-fatal: center will just stay empty if no analysis exists
    }
  };

  const handleRecompute = async () => {
    if (recomputing) return;
    setRecomputing(true);
    try {
      const res = await fetch("/api/analyze/recompute", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "no_cache") {
          alert("No cached data found. Run a full analysis first.");
        }
        return;
      }
      await fetchLatestAnalysis();
    } catch {
      // non-fatal
    } finally {
      setRecomputing(false);
    }
  };

  useEffect(() => {
    setConversations(loadConversations());
    // Always fetch client-side so center area never depends solely on server props
    fetchLatestAnalysis();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const initConversation = async (convId: string) => {
    reset();
    const hiddenInit: ChatMsg = { role: "user", content: INIT_PROMPT, hidden: true };
    const replyText = await append([hiddenInit]);
    const finalMessages: ChatMsg[] = [hiddenInit, { role: "assistant", content: replyText }];
    setMessages(finalMessages);
    setConversations((prev) => {
      const updated = prev.map((c) =>
        c.id === convId
          ? { ...c, messages: finalMessages, lastMessage: replyText.slice(0, 80) }
          : c
      );
      saveConversations(updated);
      return updated;
    });
  };

  const openAccountWithNewChat = (accountType: AccountType, forceNew = false) => {
    setMainView(accountType);

    const accountName =
      accountType === "youtube"
        ? (ytConn?.channelTitle ?? "YouTube")
        : accountType === "instagram"
        ? igConn
          ? `@${igConn.username}`
          : "Instagram"
        : (ttConn?.displayName ?? "TikTok");

    if (!forceNew) {
      const today = new Date().toDateString();
      const existingToday = conversations.find(
        (c) => c.accountType === accountType && new Date(c.createdAt).toDateString() === today
      );
      if (existingToday) {
        setActiveConvId(existingToday.id);
        setAiPanelOpen(true);
        if (existingToday.messages.length > 0) {
          setMessages(existingToday.messages);
        } else {
          setMessages([]);
          initConversation(existingToday.id);
        }
        return;
      }
    }

    const now = new Date();
    const newConv: StoredConversation = {
      id: crypto.randomUUID(),
      title: `${accountName} · ${now.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`,
      accountType,
      createdAt: now.toISOString(),
      lastMessage: "",
      messages: [],
    };

    setConversations((prev) => {
      const updated = [newConv, ...prev];
      saveConversations(updated);
      return updated;
    });

    setActiveConvId(newConv.id);
    setMessages([]);
    setAiPanelOpen(true);
    initConversation(newConv.id);
  };

  const openSavedConversation = (conv: StoredConversation) => {
    setActiveConvId(conv.id);
    setMessages(conv.messages);
    setMainView(conv.accountType);
    setAiPanelOpen(true);
  };

  const handleSendMessage = async () => {
    const text = chatInput.trim();
    if (!text || aiLoading) return;
    setChatInput("");

    const userMsg: ChatMsg = { role: "user", content: text };
    const updatedMessages: ChatMsg[] = [...messages, userMsg];
    setMessages(updatedMessages);

    const replyText = await append(updatedMessages);
    if (activeConvId) {
      const finalMessages: ChatMsg[] = [...updatedMessages, { role: "assistant", content: replyText }];
      setConversations((prev) => {
        const updated = prev.map((c) =>
          c.id === activeConvId
            ? { ...c, messages: finalMessages, lastMessage: replyText.slice(0, 80) }
            : c
        );
        saveConversations(updated);
        return updated;
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const startNewChatForCurrentView = () => {
    const accountType = (mainView !== "dashboard" && mainView !== "saved-ideas") ? (mainView as AccountType) : null;
    if (accountType) {
      openAccountWithNewChat(accountType, true);
    }
  };

  const displayMessages = messages.filter((m: ChatMsg) => !m.hidden);

  let centerContent: React.ReactNode;
  if (mainView === "dashboard") {
    centerContent = (
      <DashboardView
        analysis={effectiveAnalysis}
        snapshots={snapshots}
        ytConn={ytConn}
        igConn={igConn}
        ttConn={ttConn}
      />
    );
  } else if (mainView === "saved-ideas") {
    centerContent = (
      <div className="min-h-full">
        <div className="border-b border-[#1f1f22] px-6 py-4">
          <p className="text-sm font-semibold">Saved Ideas</p>
        </div>
        <SavedIdeasBoard
          onOpenChat={(p) => openAccountWithNewChat(p as AccountType)}
          recentVideos={
            (effectiveAnalysis?.summary?.allVideos ?? [])
              .slice()
              .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
              .slice(0, 15)
              .map((v) => ({ id: v.id, title: v.title, viewCount: v.viewCount, publishedAt: v.publishedAt }))
          }
        />
      </div>
    );
  } else if (mainView === "youtube") {
    centerContent = effectiveAnalysis ? (
      <AnalysisContent analysis={effectiveAnalysis} snapshots={snapshots} platformFilter="youtube" />
    ) : (
      <EmptyAccountView name="YouTube" href="/api/auth/youtube" />
    );
  } else if (mainView === "instagram") {
    centerContent = effectiveAnalysis ? (
      <AnalysisContent analysis={effectiveAnalysis} snapshots={[]} platformFilter="instagram" />
    ) : (
      <EmptyAccountView name="Instagram" href="/api/auth/instagram" />
    );
  } else {
    centerContent = effectiveAnalysis ? (
      <AnalysisContent analysis={effectiveAnalysis} snapshots={[]} platformFilter="tiktok" />
    ) : (
      <EmptyAccountView name="TikTok" href="/api/auth/tiktok" />
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#09090b] text-white">
      {/* ── Sidebar ── */}
      <aside className="w-60 shrink-0 flex flex-col h-full border-r border-[#1f1f22] bg-[#0d0d0f] overflow-hidden">
        <button
          onClick={() => { setMainView("dashboard"); setAiPanelOpen(false); }}
          title="Go to Overview"
          className="flex items-center gap-2 px-4 py-4 border-b border-[#1f1f22] shrink-0 text-left hover:bg-[#161618] transition-colors"
        >
          <div className="w-6 h-6 bg-[#ff3040] rounded flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-white fill-white" />
          </div>
          <span className="font-semibold text-[14px] tracking-tight">CreatorIQ</span>
        </button>

        <div className="flex-1 overflow-y-auto py-2 space-y-1">
          {/* Overview */}
          <div className="px-2">
            <button
              onClick={() => {
                setMainView("dashboard");
                setAiPanelOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${
                mainView === "dashboard" && !aiPanelOpen
                  ? "bg-[#1c1c1f] text-white"
                  : "text-zinc-500 hover:bg-[#161618] hover:text-zinc-300"
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5 shrink-0" />
              <span className="text-[12px] font-medium">Overview</span>
            </button>
          </div>

          {(instagramError || tiktokError) && (
            <div className="mx-3 flex items-start gap-2 text-xs text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-2">
              <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
              <span>
                {instagramError ? "Instagram connection failed." : "TikTok connection failed."}
              </span>
            </div>
          )}

          {/* Connected Accounts */}
          <div className="px-2 pt-2">
            <p className="px-3 py-1 text-[10px] text-zinc-700 uppercase tracking-widest font-medium">
              Accounts
            </p>
            <div className="mt-0.5 space-y-0.5">
              {ytConn ? (
                <button
                  onClick={() => openAccountWithNewChat("youtube")}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${
                    mainView === "youtube"
                      ? "bg-[#1c1c1f] text-white"
                      : "text-zinc-400 hover:bg-[#161618] hover:text-zinc-200"
                  }`}
                >
                  {ytConn.channelThumbnail ? (
                    <img
                      src={ytConn.channelThumbnail}
                      alt=""
                      className="w-5 h-5 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-[#ff3040]/20 flex items-center justify-center shrink-0">
                      <PlayCircle className="w-3 h-3 text-[#ff3040]" />
                    </div>
                  )}
                  <span className="text-[12px] font-medium truncate flex-1">
                    {ytConn.channelTitle}
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                </button>
              ) : (
                <a
                  href="/api/auth/youtube"
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-zinc-700 hover:text-zinc-400 hover:bg-[#161618] transition-colors"
                >
                  <PlayCircle className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[12px]">Connect YouTube</span>
                </a>
              )}

              {igConn ? (
                <button
                  onClick={() => openAccountWithNewChat("instagram")}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${
                    mainView === "instagram"
                      ? "bg-[#1c1c1f] text-white"
                      : "text-zinc-400 hover:bg-[#161618] hover:text-zinc-200"
                  }`}
                >
                  {igConn.profilePictureUrl ? (
                    <img
                      src={igConn.profilePictureUrl}
                      alt=""
                      className="w-5 h-5 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-600/20 to-pink-500/20 flex items-center justify-center shrink-0">
                      <Camera className="w-3 h-3 text-pink-400" />
                    </div>
                  )}
                  <span className="text-[12px] font-medium truncate flex-1">
                    @{igConn.username}
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                </button>
              ) : (
                <a
                  href="/api/auth/instagram"
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-zinc-700 hover:text-zinc-400 hover:bg-[#161618] transition-colors"
                >
                  <Camera className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[12px]">Connect Instagram</span>
                </a>
              )}

              {ttConn ? (
                <button
                  onClick={() => openAccountWithNewChat("tiktok")}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${
                    mainView === "tiktok"
                      ? "bg-[#1c1c1f] text-white"
                      : "text-zinc-400 hover:bg-[#161618] hover:text-zinc-200"
                  }`}
                >
                  {ttConn.avatarUrl ? (
                    <img
                      src={ttConn.avatarUrl}
                      alt=""
                      className="w-5 h-5 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-cyan-500/20 to-[#EE1D52]/20 flex items-center justify-center shrink-0">
                      <Music2 className="w-3 h-3 text-cyan-400" />
                    </div>
                  )}
                  <span className="text-[12px] font-medium truncate flex-1">
                    {ttConn.displayName}
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                </button>
              ) : (
                <a
                  href="/api/auth/tiktok"
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-zinc-700 hover:text-zinc-400 hover:bg-[#161618] transition-colors"
                >
                  <Music2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[12px]">Connect TikTok</span>
                </a>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="mx-3 border-t border-[#1f1f22] mt-2" />

          {/* Saved Ideas */}
          <div className="px-2 pt-1">
            <button
              onClick={() => { setMainView("saved-ideas"); setAiPanelOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${
                mainView === "saved-ideas"
                  ? "bg-[#1c1c1f] text-white"
                  : "text-zinc-500 hover:bg-[#161618] hover:text-zinc-300"
              }`}
            >
              <Lightbulb className="w-3.5 h-3.5 shrink-0" />
              <span className="text-[12px] font-medium">Saved Ideas</span>
            </button>
          </div>

          {/* Divider */}
          <div className="mx-3 border-t border-[#1f1f22] mt-2" />

          {/* History — grouped by platform, collapsed by default */}
          {conversations.length > 0 && (
            <div className="px-2 pt-1">
              <button
                onClick={() => setConvosExpanded((v) => !v)}
                className="w-full flex items-center gap-1.5 px-3 py-1 text-[10px] text-zinc-700 uppercase tracking-widest font-medium hover:text-zinc-500 transition-colors"
              >
                {convosExpanded ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
                History
              </button>
              {convosExpanded && (
                <div className="mt-1 space-y-1">
                  {(["youtube", "instagram", "tiktok"] as AccountType[]).map((platform) => {
                    const platformConvs = conversations
                      .filter((c) => c.accountType === platform)
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                    if (!platformConvs.length) return null;
                    const platformLabel =
                      platform === "youtube" ? "YouTube" : platform === "instagram" ? "Instagram" : "TikTok";
                    const platformIcon =
                      platform === "youtube" ? (
                        <PlayCircle className="w-3 h-3 text-[#ff3040]" />
                      ) : platform === "instagram" ? (
                        <Camera className="w-3 h-3 text-pink-400" />
                      ) : (
                        <Music2 className="w-3 h-3 text-cyan-400" />
                      );
                    const isExpanded = expandedPlatforms[platform];
                    return (
                      <div key={platform}>
                        <button
                          onClick={() =>
                            setExpandedPlatforms((prev) => ({ ...prev, [platform]: !prev[platform] }))
                          }
                          className="w-full flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-zinc-600 hover:text-zinc-400 transition-colors"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ChevronRight className="w-3 h-3" />
                          )}
                          {platformIcon}
                          <span className="text-[10px] uppercase tracking-widest font-medium">
                            {platformLabel}
                          </span>
                        </button>
                        {isExpanded && (
                          <div className="space-y-0.5">
                            {platformConvs.map((conv) => (
                              <button
                                key={conv.id}
                                onClick={() => openSavedConversation(conv)}
                                className={`w-full flex items-start gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${
                                  activeConvId === conv.id && aiPanelOpen
                                    ? "bg-[#1c1c1f] text-white"
                                    : "text-zinc-500 hover:bg-[#161618] hover:text-zinc-300"
                                }`}
                              >
                                <MessageSquare className="w-3 h-3 shrink-0 mt-0.5 opacity-60" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-[11px] font-medium truncate">{conv.title}</p>
                                  {conv.lastMessage && (
                                    <p className="text-[10px] text-zinc-700 truncate mt-0.5">
                                      {conv.lastMessage}
                                    </p>
                                  )}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Settings + Re-analyze — pinned to sidebar bottom */}
        <div className="shrink-0 border-t border-[#1f1f22] px-2 py-2 space-y-0.5">
          {ytConn && (
            <>
              <a
                href="/analyzing?reanalyze=1"
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-zinc-500 hover:bg-[#161618] hover:text-zinc-300 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[12px] font-medium">Re-analyze</span>
              </a>
              <button
                onClick={handleRecompute}
                disabled={recomputing}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-zinc-500 hover:bg-[#161618] hover:text-zinc-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {recomputing ? (
                  <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
                ) : (
                  <Database className="w-3.5 h-3.5 shrink-0" />
                )}
                <span className="text-[12px] font-medium">
                  {recomputing ? "Recomputing…" : "Recompute"}
                </span>
              </button>
            </>
          )}
          <a
            href="/settings"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-zinc-500 hover:bg-[#161618] hover:text-zinc-300 transition-colors"
          >
            <Settings className="w-3.5 h-3.5 shrink-0" />
            <span className="text-[12px] font-medium">Settings</span>
          </a>
        </div>
      </aside>

      {/* ── Center ── */}
      <main className="flex-1 overflow-y-auto min-w-0">{centerContent}</main>

      {/* ── Right AI Panel ── */}
      {aiPanelOpen && (
        <aside className="w-[360px] shrink-0 flex flex-col h-full border-l border-[#1f1f22] bg-[#0a0a0c]">
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3.5 border-b border-[#1f1f22] shrink-0">
            <div className="w-6 h-6 bg-[#ff3040]/10 rounded-lg flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-[#ff3040]" />
            </div>
            <span className="text-[13px] font-semibold flex-1">AI Assistant</span>
            <button
              onClick={startNewChatForCurrentView}
              title="New conversation"
              className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-[#1c1c1f] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setAiPanelOpen(false)}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-[#1c1c1f] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
            {displayMessages.length === 0 && aiLoading && (
              <div className="flex gap-2.5 items-start">
                <div className="w-6 h-6 bg-[#1c1c1f] rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <Sparkles className="w-3 h-3 text-[#ff3040]" />
                </div>
                <div className="bg-[#111113] border border-[#27272a] rounded-2xl rounded-tl-sm px-4 py-3">
                  <Loader2 className="w-3.5 h-3.5 text-zinc-500 animate-spin" />
                </div>
              </div>
            )}

            {displayMessages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2.5 items-start ${msg.role === "user" ? "flex-row-reverse" : ""}`}
              >
                {msg.role === "assistant" && (
                  <div className="w-6 h-6 bg-[#1c1c1f] rounded-full flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles className="w-3 h-3 text-[#ff3040]" />
                  </div>
                )}
                <div
                  className={`max-w-[87%] text-[13px] leading-relaxed whitespace-pre-wrap rounded-2xl px-4 py-3 ${
                    msg.role === "user"
                      ? "bg-[#ff3040] text-white rounded-tr-sm"
                      : "bg-[#111113] text-zinc-200 border border-[#27272a] rounded-tl-sm"
                  }`}
                >
                  {msg.content ||
                    (msg.role === "assistant" &&
                    aiLoading &&
                    i === displayMessages.length - 1 ? (
                      <Loader2 className="w-3.5 h-3.5 text-zinc-500 animate-spin" />
                    ) : null)}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="shrink-0 border-t border-[#1f1f22] px-3 py-3">
            <div className="flex items-end gap-2">
              <div className="flex-1 bg-[#111113] border border-[#27272a] rounded-xl px-3.5 py-2.5 focus-within:border-[#ff3040]/40 transition-colors">
                <textarea
                  ref={inputRef}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything about your channel…"
                  rows={1}
                  className="w-full bg-transparent text-[13px] text-white placeholder-zinc-600 focus:outline-none resize-none min-h-[20px] max-h-[120px]"
                  style={{ fieldSizing: "content" } as React.CSSProperties}
                />
              </div>
              <button
                onClick={handleSendMessage}
                disabled={!chatInput.trim() || aiLoading}
                className="w-8 h-8 bg-[#ff3040] hover:bg-[#e02030] disabled:opacity-30 disabled:cursor-not-allowed rounded-lg flex items-center justify-center shrink-0 transition-colors"
              >
                {aiLoading ? (
                  <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5 text-white" />
                )}
              </button>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}

function EmptyAccountView({ name, href }: { name: string; href: string }) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center max-w-sm px-6">
        <p className="text-sm text-zinc-500 mb-4">No data for {name} yet.</p>
        <a
          href={href}
          className="inline-flex items-center gap-2 bg-[#ff3040] hover:bg-[#e02030] text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
        >
          Connect {name}
        </a>
      </div>
    </div>
  );
}
