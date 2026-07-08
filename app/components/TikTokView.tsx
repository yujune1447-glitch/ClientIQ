"use client";

import { useEffect, useState } from "react";
import { Music2, Loader2, AlertCircle, RefreshCw, Lock } from "lucide-react";
import { Card, StatBlock } from "@/app/components/AnalysisContent";

interface TikTokAccount {
  displayName: string;
  avatarUrl: string | null;
  followerCount: number;
  followingCount: number;
  likesCount: number;
  videoCount: number;
}

type TtTab = "live" | "analysis";
const TT_TABS: { key: TtTab; label: string }[] = [
  { key: "live", label: "Live Stats" },
  { key: "analysis", label: "Channel Analysis" },
];

type Status = "loading" | "connected" | "empty" | "error";

const fmt = (n: number) =>
  new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);

export function TikTokView({ initialConn }: { initialConn: TikTokAccount | null }) {
  const [account, setAccount] = useState<TikTokAccount | null>(initialConn);
  const [status, setStatus] = useState<Status>(initialConn ? "connected" : "loading");
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [tab, setTab] = useState<TtTab>("live");
  const [refreshing, setRefreshing] = useState(false);

  const load = async (isManual: boolean) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch("/api/tiktok/status");
      const data = await res.json();
      if (res.ok && data.connected) {
        setAccount(data.account);
        setStatus("connected");
        setNeedsReconnect(false);
      } else if (data.needsReconnect) {
        setStatus("error");
        setNeedsReconnect(true);
      } else {
        setStatus("empty");
      }
    } catch {
      // Keep showing cached account on a transient refresh failure; only hard-fail
      // when there was nothing to show in the first place.
      if (!account) setStatus("error");
    } finally {
      if (isManual) setRefreshing(false);
    }
  };

  useEffect(() => {
    load(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Non-connected states (no tab chrome) ──────────────────────────────────
  if (status === "loading") {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-zinc-600 animate-spin" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-full max-w-md px-6">
          <div className="bg-[#111113] border border-[#1f1f22] rounded-xl p-6 text-center">
            <div className="w-10 h-10 rounded-full bg-[#2a1416] flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="w-5 h-5 text-[#ff3040]" />
            </div>
            <p className="text-sm font-semibold text-white">
              {needsReconnect ? "TikTok session expired" : "Couldn't load TikTok"}
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              {needsReconnect
                ? "Your access token expired or was revoked. Reconnect to keep your stats up to date."
                : "Something went wrong fetching your TikTok stats. Try reconnecting."}
            </p>
            <a
              href="/api/auth/tiktok"
              className="inline-flex items-center gap-2 bg-[#ff3040] hover:bg-[#e02030] text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors mt-4"
            >
              Reconnect TikTok
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (status === "empty" || !account) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-sm px-6">
          <p className="text-sm text-zinc-500 mb-4">No data for TikTok yet.</p>
          <a
            href="/api/auth/tiktok"
            className="inline-flex items-center gap-2 bg-[#ff3040] hover:bg-[#e02030] text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
          >
            Connect TikTok
          </a>
        </div>
      </div>
    );
  }

  // ── Connected: full structured view mirroring YouTubeView ─────────────────
  return (
    <div className="min-h-full">
      {/* Account header — always visible (mirrors YouTube channel header) */}
      <div className="border-b border-[#1f1f22]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex items-center gap-3 pt-6 pb-4">
            {account.avatarUrl ? (
              <img src={account.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-500 to-[#EE1D52] flex items-center justify-center shrink-0">
                <Music2 className="w-4 h-4 text-white" />
              </div>
            )}
            <div>
              <h1 className="text-base font-semibold leading-tight">{account.displayName}</h1>
              <p className="text-[11px] text-zinc-500">TikTok · Live account stats</p>
            </div>
            <div className="ml-auto flex items-center gap-5 text-right">
              <div>
                <p className="text-sm font-bold tabular-nums">{fmt(account.followerCount)}</p>
                <p className="text-[10px] text-zinc-600">Followers</p>
              </div>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex gap-0">
            {TT_TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors ${
                  tab === key
                    ? "border-[#ff3040] text-white"
                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tab: Live Stats ── */}
      {tab === "live" && (
        <div className="max-w-5xl mx-auto px-6 py-6 space-y-4 pb-24">
          {/* Refresh — TikTok data is account-level only, so this re-calls
              /api/tiktok/status live (no quota management needed). */}
          <div className="flex justify-end">
            <button
              onClick={() => load(true)}
              disabled={refreshing}
              className="flex items-center gap-2 bg-[#111113] border border-[#1f1f22] hover:border-[#27272a] text-zinc-300 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          <Card title="Account Overview">
            <div className="flex divide-x divide-[#1f1f22]">
              <StatBlock label="Followers" value={fmt(account.followerCount)} sub="total" />
              <StatBlock label="Following" value={fmt(account.followingCount)} sub="total" />
              <StatBlock label="Likes" value={fmt(account.likesCount)} sub="across all videos" />
              <StatBlock label="Videos" value={fmt(account.videoCount)} sub="published" />
            </div>
          </Card>
        </div>
      )}

      {/* ── Tab: Channel Analysis (gated) ── */}
      {tab === "analysis" && (
        <div className="max-w-5xl mx-auto px-6 py-6 space-y-4 pb-24">
          {/*
            INTEGRATION POINT — when TIKTOK_VIDEO_ENABLED flips true (video.list
            scope approved), replace this locked card with real per-video analysis
            sections mirroring YouTube's six-layer analysis. The data pipeline
            already exists: lib/tiktok.ts fetchTikTokData() returns a TikTokSummary
            (per-video stats, averages, topVideos). Render those here as Cards /
            section components analogous to Retention/Growth/etc.
          */}
          <div className="bg-[#111113] border border-[#1f1f22] rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-[#1f1f22]">
              <Lock className="w-3.5 h-3.5 text-zinc-500" />
              <p className="text-sm font-semibold text-white">Channel Analysis</p>
              <span className="ml-auto text-[10px] uppercase tracking-wider text-zinc-500 border border-[#27272a] rounded-full px-2 py-0.5">
                Locked
              </span>
            </div>
            <div className="p-8 text-center">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500/30 to-[#EE1D52]/30 flex items-center justify-center mx-auto mb-4">
                <Music2 className="w-5 h-5 text-white/70" />
              </div>
              <p className="text-sm font-semibold text-white">Deeper content analysis is coming</p>
              <p className="text-xs text-zinc-500 mt-1.5 max-w-md mx-auto leading-relaxed">
                Deeper content analysis unlocks once TikTok grants video-level API access. Your
                per-video breakdown, top performers, and engagement patterns will appear here
                automatically — nothing to do on your end.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
