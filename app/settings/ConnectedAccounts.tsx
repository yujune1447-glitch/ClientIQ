"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlayCircle, Music2, Camera, Loader2 } from "lucide-react";

type Account = { title: string; avatarUrl: string | null } | null;

export default function ConnectedAccounts({
  youtube,
  tiktok,
}: {
  youtube: Account;
  tiktok: Account;
}) {
  const router = useRouter();
  const [tt, setTt] = useState<Account>(tiktok);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disconnectTikTok = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/tiktok/disconnect", { method: "POST" });
      if (!res.ok) throw new Error();
      setTt(null);
      setConfirming(false);
      // Refresh server data so the sidebar/hub reflect the disconnected state too.
      router.refresh();
    } catch {
      setError("Couldn't disconnect. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* YouTube */}
      <Row
        icon={<PlayCircle className="w-5 h-5 text-white" />}
        iconBg="bg-[#ff0000]"
        name="YouTube"
        account={youtube}
        connectHref="/api/auth/youtube"
      />

      {/* TikTok */}
      <Row
        icon={<Music2 className="w-5 h-5 text-white" />}
        iconBg="bg-gradient-to-br from-cyan-500 to-[#EE1D52]"
        name="TikTok"
        account={tt}
        connectHref="/api/auth/tiktok"
        action={
          tt ? (
            confirming ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={disconnectTikTok}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-[#ff3040] hover:bg-[#e02030] disabled:opacity-50 rounded-md px-3 py-1.5 transition-colors"
                >
                  {busy && <Loader2 className="w-3 h-3 animate-spin" />}
                  Confirm
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  disabled={busy}
                  className="text-xs font-medium text-zinc-400 hover:text-zinc-200 px-2 py-1.5 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirming(true)}
                className="text-xs font-medium text-zinc-400 hover:text-white border border-[#27272a] hover:border-zinc-600 rounded-md px-3 py-1.5 transition-colors"
              >
                Disconnect
              </button>
            )
          ) : undefined
        }
      />

      {/* Instagram — inert, blocked pending Meta verification */}
      <div className="flex items-center gap-3 bg-[#0d0d0f] border border-[#1a1a1d] rounded-xl p-4 opacity-60 select-none">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-600/40 to-pink-500/40 flex items-center justify-center shrink-0">
          <Camera className="w-5 h-5 text-white/70" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-300">Instagram</p>
          <p className="text-xs text-zinc-600 mt-0.5">Blocked pending Meta verification.</p>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 border border-[#27272a] rounded-full px-2 py-0.5 shrink-0">
          Coming soon
        </span>
      </div>

      {error && <p className="text-xs text-red-400 pt-1">{error}</p>}
    </div>
  );
}

function Row({
  icon,
  iconBg,
  name,
  account,
  connectHref,
  action,
}: {
  icon: React.ReactNode;
  iconBg: string;
  name: string;
  account: Account;
  connectHref: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 bg-[#111113] border border-[#1f1f22] rounded-xl p-4">
      <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white">{name}</p>
        {account ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-500 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            {account.title}
          </span>
        ) : (
          <p className="text-xs text-zinc-600 mt-0.5">Not connected</p>
        )}
      </div>
      {account
        ? action
        : (
          <a
            href={connectHref}
            className="text-xs font-medium text-[#ff3040] hover:text-[#ff5464] shrink-0 transition-colors"
          >
            Connect
          </a>
        )}
    </div>
  );
}
