"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Zap, PlayCircle, Camera, Music2,
  ChevronDown, ChevronRight, Calendar, AlertCircle, X,
  Send, Loader2, LayoutDashboard, Plus,
} from "lucide-react";
import { AnalysisContent, type AnalysisData } from "@/app/components/AnalysisContent";
import { DashboardView } from "@/app/components/DashboardView";
import type { ChannelSnapshot } from "@/types";

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
  userId: string;
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

type MainView = "dashboard" | "youtube" | "instagram" | "tiktok" | "analysis";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatTab {
  id: string;
  title: string;
  messages: Message[];
  loading: boolean;
  analysisId: string | null;
}

const SUGGESTIONS = [
  "What should I make next?",
  "Why are my top videos performing?",
  "How can I improve my CTR?",
  "What does my audience want more of?",
];

export default function WorkspaceShell({
  sidebarAnalyses,
  selectedAnalysisId,
  selectedAnalysis,
  ytConn,
  igConn,
  ttConn,
  snapshots,
  instagramError,
  tiktokError,
}: Props) {
  const router = useRouter();
  const [mainView, setMainView] = useState<MainView>("dashboard");
  const [ytExpanded, setYtExpanded] = useState(true);
  const [igExpanded, setIgExpanded] = useState(false);
  const [ttExpanded, setTtExpanded] = useState(false);
  const [chatTabs, setChatTabs] = useState<ChatTab[]>([]);
  const [activeChatTabId, setActiveChatTabId] = useState<string | null>(null);
  const [bottomInput, setBottomInput] = useState("");
  const bottomInputRef = useRef<HTMLTextAreaElement>(null);

  const activeChatTab = chatTabs.find((t) => t.id === activeChatTabId) ?? null;

  const groupedByDate = sidebarAnalyses.reduce<Record<string, SidebarAnalysis[]>>((acc, a) => {
    const month = new Date(a.createdAt).toLocaleDateString("en-AU", { month: "short", year: "numeric" });
    (acc[month] ??= []).push(a);
    return acc;
  }, {});

  const navigatePlatform = (platform: "youtube" | "instagram" | "tiktok") => {
    setMainView(platform);
    setActiveChatTabId(null);
  };

  const navigateDashboard = () => {
    setMainView("dashboard");
    setActiveChatTabId(null);
  };

  const navigateAnalysis = (id: string) => {
    setMainView("analysis");
    setActiveChatTabId(null);
    router.push(`/workspace?analysis=${id}`);
  };

  const closeTab = (tabId: string) => {
    setChatTabs((prev) => prev.filter((t) => t.id !== tabId));
    if (activeChatTabId === tabId) setActiveChatTabId(null);
  };

  const sendToApi = async (tabId: string, messagesToSend: Message[], analysisId: string | null) => {
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: messagesToSend, analysisId }),
      });
      if (!res.ok || !res.body) throw new Error("bad response");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setChatTabs((prev) =>
          prev.map((t) =>
            t.id === tabId
              ? { ...t, messages: [...t.messages.slice(0, -1), { role: "assistant", content: text }] }
              : t
          )
        );
      }
    } catch {
      setChatTabs((prev) =>
        prev.map((t) =>
          t.id === tabId
            ? { ...t, messages: [...t.messages.slice(0, -1), { role: "assistant", content: "Something went wrong. Try again." }] }
            : t
        )
      );
    } finally {
      setChatTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, loading: false } : t)));
    }
  };

  const handleBottomSubmit = () => {
    const text = bottomInput.trim();
    if (!text) return;
    setBottomInput("");

    if (activeChatTab) {
      if (activeChatTab.loading) return;
      const userMsg: Message = { role: "user", content: text };
      const assistantMsg: Message = { role: "assistant", content: "" };
      const updated = [...activeChatTab.messages, userMsg, assistantMsg];
      setChatTabs((prev) =>
        prev.map((t) => (t.id === activeChatTab.id ? { ...t, loading: true, messages: updated } : t))
      );
      sendToApi(activeChatTab.id, [...activeChatTab.messages, userMsg], activeChatTab.analysisId);
      return;
    }

    const id = crypto.randomUUID();
    const userMsg: Message = { role: "user", content: text };
    const assistantMsg: Message = { role: "assistant", content: "" };
    const newTab: ChatTab = {
      id,
      title: text.length > 32 ? text.slice(0, 32) + "…" : text,
      messages: [userMsg, assistantMsg],
      loading: true,
      analysisId: selectedAnalysisId,
    };
    setChatTabs((prev) => [...prev, newTab]);
    setActiveChatTabId(id);
    sendToApi(id, [userMsg], selectedAnalysisId);
  };

  const handleBottomKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleBottomSubmit();
    }
  };

  const openNewChatFocus = () => {
    setActiveChatTabId(null);
    setTimeout(() => bottomInputRef.current?.focus(), 50);
  };

  let mainContent: React.ReactNode;
  if (activeChatTab) {
    mainContent = <ChatMessages tab={activeChatTab} />;
  } else if (mainView === "dashboard") {
    mainContent = (
      <DashboardView
        analysis={selectedAnalysis}
        snapshots={snapshots}
        ytConn={ytConn}
        igConn={igConn}
        ttConn={ttConn}
        onNavigate={navigatePlatform}
      />
    );
  } else if (mainView === "youtube") {
    mainContent = selectedAnalysis ? (
      <AnalysisContent analysis={selectedAnalysis} snapshots={snapshots} platformFilter="youtube" />
    ) : (
      <EmptyPlatform name="YouTube" href="/api/auth/youtube" />
    );
  } else if (mainView === "instagram") {
    mainContent = selectedAnalysis ? (
      <AnalysisContent analysis={selectedAnalysis} snapshots={[]} platformFilter="instagram" />
    ) : (
      <EmptyPlatform name="Instagram" href="/api/auth/instagram" />
    );
  } else if (mainView === "tiktok") {
    mainContent = selectedAnalysis ? (
      <AnalysisContent analysis={selectedAnalysis} snapshots={[]} platformFilter="tiktok" />
    ) : (
      <EmptyPlatform name="TikTok" href="/api/auth/tiktok" />
    );
  } else {
    mainContent = selectedAnalysis ? (
      <AnalysisContent analysis={selectedAnalysis} snapshots={snapshots} />
    ) : null;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#09090b] text-white">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 flex flex-col h-full border-r border-[#1f1f22] bg-[#0d0d0f] overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-4 border-b border-[#1f1f22] shrink-0">
          <div className="w-6 h-6 bg-[#ff3040] rounded flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-white fill-white" />
          </div>
          <span className="font-semibold text-[14px] tracking-tight">CreatorIQ</span>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          <div className="px-2 mb-2">
            <button
              onClick={navigateDashboard}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${
                mainView === "dashboard" && !activeChatTabId
                  ? "bg-[#1c1c1f] text-white"
                  : "text-zinc-500 hover:bg-[#161618] hover:text-zinc-300"
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5 shrink-0" />
              <span className="text-[12px] font-medium">Overview</span>
            </button>
          </div>

          {(instagramError || tiktokError) && (
            <div className="mx-3 mb-2 flex items-start gap-2 text-xs text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-2">
              <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
              <span>{instagramError ? "Instagram connection failed." : "TikTok connection failed."}</span>
            </div>
          )}

          <div className="px-2 mt-1 space-y-0.5">
            <p className="px-3 py-1 text-[10px] text-zinc-700 uppercase tracking-widest font-medium">Platforms</p>

            {/* YouTube */}
            {ytConn ? (
              <div>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => navigatePlatform("youtube")}
                    className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors min-w-0 ${
                      mainView === "youtube" && !activeChatTabId
                        ? "bg-[#1c1c1f] text-white"
                        : "text-zinc-400 hover:bg-[#161618] hover:text-zinc-200"
                    }`}
                  >
                    {ytConn.channelThumbnail ? (
                      <img src={ytConn.channelThumbnail} alt={ytConn.channelTitle} className="w-4 h-4 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full bg-[#ff3040] flex items-center justify-center shrink-0">
                        <PlayCircle className="w-2.5 h-2.5 text-white" />
                      </div>
                    )}
                    <span className="text-[12px] font-medium truncate">{ytConn.channelTitle}</span>
                  </button>
                  <button
                    onClick={() => setYtExpanded((v) => !v)}
                    className="w-7 h-7 flex items-center justify-center text-zinc-700 hover:text-zinc-400 rounded shrink-0"
                  >
                    {ytExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  </button>
                </div>

                {ytExpanded && (
                  <div className="ml-3 mt-0.5 space-y-0.5">
                    {sidebarAnalyses.length === 0 ? (
                      <p className="px-3 py-2 text-[11px] text-zinc-700">No analyses yet</p>
                    ) : (
                      Object.entries(groupedByDate).map(([month, items]) => (
                        <div key={month}>
                          <p className="px-3 pt-2 pb-0.5 text-[10px] text-zinc-700 uppercase tracking-widest font-medium">{month}</p>
                          {items.map((a) => {
                            const date = new Date(a.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
                            const isSelected = a.id === selectedAnalysisId && mainView === "analysis" && !activeChatTabId;
                            return (
                              <button
                                key={a.id}
                                onClick={() => navigateAnalysis(a.id)}
                                className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-left transition-colors ${
                                  isSelected
                                    ? "bg-[#1c1c1f] text-white"
                                    : "text-zinc-600 hover:bg-[#161618] hover:text-zinc-300"
                                }`}
                              >
                                <Calendar className="w-3 h-3 shrink-0 opacity-60" />
                                <span className="text-[11px] truncate flex-1">{date}</span>
                                {a.isUnread && <span className="w-1.5 h-1.5 rounded-full bg-[#ff3040] shrink-0" />}
                                {a.isScheduled && !a.isUnread && (
                                  <span className="text-[9px] text-zinc-700 shrink-0">auto</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ) : (
              <a
                href="/api/auth/youtube"
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-zinc-700 hover:text-zinc-400 hover:bg-[#161618] transition-colors"
              >
                <PlayCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[12px]">Connect YouTube</span>
              </a>
            )}

            {/* Instagram */}
            {igConn ? (
              <div>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => navigatePlatform("instagram")}
                    className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors min-w-0 ${
                      mainView === "instagram" && !activeChatTabId
                        ? "bg-[#1c1c1f] text-white"
                        : "text-zinc-400 hover:bg-[#161618] hover:text-zinc-200"
                    }`}
                  >
                    {igConn.profilePictureUrl ? (
                      <img src={igConn.profilePictureUrl} alt={igConn.username} className="w-4 h-4 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center shrink-0">
                        <Camera className="w-2.5 h-2.5 text-white" />
                      </div>
                    )}
                    <span className="text-[12px] font-medium truncate">@{igConn.username}</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 ml-auto" />
                  </button>
                  <button
                    onClick={() => setIgExpanded((v) => !v)}
                    className="w-7 h-7 flex items-center justify-center text-zinc-700 hover:text-zinc-400 rounded shrink-0"
                  >
                    {igExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  </button>
                </div>
                {igExpanded && sidebarAnalyses.length > 0 && (
                  <div className="ml-3 mt-0.5">
                    <p className="px-3 py-2 text-[11px] text-zinc-700">Stats included in each analysis</p>
                  </div>
                )}
              </div>
            ) : (
              <a
                href="/api/auth/instagram"
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-zinc-700 hover:text-zinc-400 hover:bg-[#161618] transition-colors"
              >
                <Camera className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[12px]">Connect Instagram</span>
              </a>
            )}

            {/* TikTok */}
            {ttConn ? (
              <div>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => navigatePlatform("tiktok")}
                    className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors min-w-0 ${
                      mainView === "tiktok" && !activeChatTabId
                        ? "bg-[#1c1c1f] text-white"
                        : "text-zinc-400 hover:bg-[#161618] hover:text-zinc-200"
                    }`}
                  >
                    {ttConn.avatarUrl ? (
                      <img src={ttConn.avatarUrl} alt={ttConn.displayName} className="w-4 h-4 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full bg-gradient-to-br from-cyan-500 to-[#EE1D52] flex items-center justify-center shrink-0">
                        <Music2 className="w-2.5 h-2.5 text-white" />
                      </div>
                    )}
                    <span className="text-[12px] font-medium truncate">{ttConn.displayName}</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 ml-auto" />
                  </button>
                  <button
                    onClick={() => setTtExpanded((v) => !v)}
                    className="w-7 h-7 flex items-center justify-center text-zinc-700 hover:text-zinc-400 rounded shrink-0"
                  >
                    {ttExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  </button>
                </div>
                {ttExpanded && sidebarAnalyses.length > 0 && (
                  <div className="ml-3 mt-0.5">
                    <p className="px-3 py-2 text-[11px] text-zinc-700">Stats included in each analysis</p>
                  </div>
                )}
              </div>
            ) : (
              <a
                href="/api/auth/tiktok"
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-zinc-700 hover:text-zinc-400 hover:bg-[#161618] transition-colors"
              >
                <Music2 className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[12px]">Connect TikTok</span>
              </a>
            )}
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Chat tab bar */}
        {chatTabs.length > 0 && (
          <div className="flex items-end gap-0.5 px-2 pt-2 bg-[#0a0a0c] border-b border-[#1f1f22] shrink-0 overflow-x-auto">
            {chatTabs.map((tab) => {
              const isActive = tab.id === activeChatTabId;
              return (
                <div
                  key={tab.id}
                  role="button"
                  onClick={() => setActiveChatTabId(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg border-t border-l border-r min-w-0 max-w-[200px] cursor-pointer transition-colors select-none ${
                    isActive
                      ? "bg-[#09090b] border-[#27272a] text-white"
                      : "bg-[#0d0d0f] border-[#1a1a1c] text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {tab.loading && <Loader2 className="w-3 h-3 animate-spin shrink-0 text-zinc-500" />}
                  <span className="text-[11px] truncate flex-1">{tab.title}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                    className="shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors ml-1"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
            <button
              onClick={openNewChatFocus}
              title="New chat"
              className="flex items-center justify-center w-7 h-7 mb-0.5 rounded-lg text-zinc-700 hover:text-zinc-400 hover:bg-[#1c1c1f] transition-colors shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          {mainContent}
        </main>

        {/* Bottom AI bar */}
        <div className="shrink-0 border-t border-[#1f1f22] bg-[#09090b] px-4 pt-3 pb-4">
          {!activeChatTab && bottomInput === "" && (
            <div className="flex items-center gap-2 mb-2.5 overflow-x-auto">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setBottomInput(s);
                    bottomInputRef.current?.focus();
                  }}
                  className="shrink-0 text-[11px] text-zinc-500 hover:text-zinc-300 bg-[#111113] hover:bg-[#1c1c1f] border border-[#27272a] rounded-full px-3 py-1 transition-colors whitespace-nowrap"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center bg-[#111113] border border-[#27272a] rounded-xl px-3.5 py-2.5 focus-within:border-[#ff3040]/50 transition-colors">
              <textarea
                ref={bottomInputRef}
                value={bottomInput}
                onChange={(e) => setBottomInput(e.target.value)}
                onKeyDown={handleBottomKeyDown}
                placeholder={activeChatTab ? "Continue this conversation…" : "Ask AI anything about your channel…"}
                rows={1}
                className="flex-1 bg-transparent text-sm text-white placeholder-zinc-600 focus:outline-none resize-none min-h-[20px] max-h-[80px]"
                style={{ fieldSizing: "content" } as React.CSSProperties}
              />
            </div>
            <button
              onClick={handleBottomSubmit}
              disabled={!bottomInput.trim() || (!!activeChatTab && activeChatTab.loading)}
              className="w-9 h-9 bg-[#ff3040] hover:bg-[#e02030] disabled:opacity-30 disabled:cursor-not-allowed rounded-xl flex items-center justify-center shrink-0 transition-colors"
            >
              {activeChatTab?.loading ? (
                <Loader2 className="w-4 h-4 text-white animate-spin" />
              ) : (
                <Send className="w-4 h-4 text-white" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatMessages({ tab }: { tab: ChatTab }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [tab.messages]);

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-4">
      {tab.messages.map((msg, i) => (
        <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
          <div
            className={`max-w-[82%] text-sm rounded-2xl px-4 py-3 leading-relaxed whitespace-pre-wrap ${
              msg.role === "user"
                ? "bg-[#ff3040] text-white"
                : "bg-[#1c1c1f] text-zinc-200 border border-[#27272a]"
            }`}
          >
            {msg.content || (
              msg.role === "assistant" && tab.loading && i === tab.messages.length - 1
                ? <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
                : null
            )}
          </div>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}

function EmptyPlatform({ name, href }: { name: string; href: string }) {
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
