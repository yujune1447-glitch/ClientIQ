"use client";

import { useEffect, useState } from "react";
import { Music2, Loader2, AlertCircle } from "lucide-react";

interface TikTokAccount {
  displayName: string;
  avatarUrl: string | null;
  followerCount: number;
  followingCount: number;
  likesCount: number;
  videoCount: number;
}

type State =
  | { kind: "loading" }
  | { kind: "connected"; account: TikTokAccount }
  | { kind: "empty" }
  | { kind: "error"; needsReconnect: boolean };

const fmt = (n: number) =>
  new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);

export function TikTokLiveStats({ initial }: { initial: TikTokAccount | null }) {
  const [state, setState] = useState<State>(
    initial ? { kind: "connected", account: initial } : { kind: "loading" }
  );

  useEffect(() => {
    let cancelled = false;
    if (!initial) setState({ kind: "loading" });
    (async () => {
      try {
        const res = await fetch("/api/tiktok/status");
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.connected) setState({ kind: "connected", account: data.account });
        else if (data.needsReconnect) setState({ kind: "error", needsReconnect: true });
        else setState({ kind: "empty" });
      } catch {
        if (!cancelled) setState({ kind: "error", needsReconnect: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initial]);

  if (state.kind === "loading") {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-zinc-600 animate-spin" />
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-full max-w-md px-6">
          <div className="bg-[#111113] border border-[#1f1f22] rounded-xl p-6 text-center">
            <div className="w-10 h-10 rounded-full bg-[#2a1416] flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="w-5 h-5 text-[#ff3040]" />
            </div>
            <p className="text-sm font-semibold text-white">
              {state.needsReconnect ? "TikTok session expired" : "Couldn't load TikTok"}
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              {state.needsReconnect
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

  if (state.kind === "empty") {
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

  const { account } = state;
  const metrics = [
    { label: "Followers", value: account.followerCount },
    { label: "Following", value: account.followingCount },
    { label: "Likes", value: account.likesCount },
    { label: "Videos", value: account.videoCount },
  ];

  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-full max-w-md px-6">
        <div className="bg-[#111113] border border-[#1f1f22] rounded-xl p-6">
          <div className="flex items-center gap-4">
            {account.avatarUrl ? (
              <img src={account.avatarUrl} alt="" className="w-14 h-14 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-cyan-500 to-[#EE1D52] flex items-center justify-center shrink-0">
                <Music2 className="w-6 h-6 text-white" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-base font-semibold text-white truncate">{account.displayName}</p>
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-500">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                TikTok connected
              </span>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-4 gap-3">
            {metrics.map((m) => (
              <div key={m.label} className="text-center">
                <p className="text-lg font-semibold text-white">{fmt(m.value)}</p>
                <p className="text-[11px] text-zinc-600 mt-0.5">{m.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
