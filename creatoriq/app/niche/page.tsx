"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Zap, Search, ArrowRight, Camera, CheckCircle, AlertCircle } from "lucide-react";

const EXAMPLES = ["faith", "fitness", "finance", "productivity", "cooking", "travel", "gaming", "parenting"];

interface IGStatus {
  connected: boolean;
  username?: string;
  followerCount?: number;
  profilePictureUrl?: string;
}

export default function NichePage() {
  return (
    <Suspense>
      <NichePageInner />
    </Suspense>
  );
}

function NichePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    fetch("/api/auth/refresh").then(async (res) => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error === "needs_reauth" || res.status === 401) {
          router.replace("/api/auth/youtube");
        }
      }
    });
  }, [router]);

  const [niche, setNiche] = useState("");
  const [loading, setLoading] = useState(false);
  const [igStatus, setIgStatus] = useState<IGStatus | null>(null);
  const igError = searchParams.get("instagram_error");

  useEffect(() => {
    fetch("/api/instagram/status")
      .then((r) => r.json())
      .then(setIgStatus)
      .catch(() => setIgStatus({ connected: false }));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = niche.trim();
    if (!trimmed) return;
    setLoading(true);
    await fetch("/api/niche/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ niche: trimmed }),
    });
    router.push("/analyzing");
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-white flex flex-col">
      <nav className="border-b border-[#1f1f22] px-6 py-4 flex items-center gap-2 max-w-7xl mx-auto w-full">
        <div className="w-7 h-7 bg-[#ff3040] rounded-md flex items-center justify-center">
          <Zap className="w-4 h-4 text-white fill-white" />
        </div>
        <span className="font-semibold text-[15px] tracking-tight">CreatorIQ</span>
      </nav>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <div className="w-10 h-10 bg-[#1c1c1f] border border-[#27272a] rounded-xl flex items-center justify-center mb-6">
              <Search className="w-5 h-5 text-zinc-400" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight mb-3">What&apos;s your niche?</h1>
            <p className="text-zinc-500 text-sm leading-relaxed">
              We&apos;ll analyse the top performing public videos in your space — extracting title patterns,
              optimal lengths, and gaps your channel can fill.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="text"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                placeholder="e.g. faith, fitness, finance..."
                className="w-full bg-[#111113] border border-[#27272a] rounded-lg px-4 py-3 text-white placeholder-zinc-600 text-sm focus:outline-none focus:border-[#ff3040]/60 transition-colors"
                autoFocus
                disabled={loading}
              />
              <p className="text-[11px] text-zinc-700 mt-2">One word or short phrase works best</p>
            </div>

            <button
              type="submit"
              disabled={!niche.trim() || loading}
              className="flex items-center justify-center gap-2 w-full bg-[#ff3040] hover:bg-[#e02030] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors text-sm"
            >
              {loading ? "Starting analysis..." : "Analyse my niche"}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>

          <div className="mt-8">
            <p className="text-[11px] text-zinc-700 uppercase tracking-widest mb-3">Popular niches</p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setNiche(ex)}
                  className="px-3 py-1.5 bg-[#1c1c1f] border border-[#27272a] rounded-full text-xs text-zinc-400 hover:text-white hover:border-[#ff3040]/40 transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8 border-t border-[#1f1f22] pt-6">
            <p className="text-[11px] text-zinc-700 uppercase tracking-widest mb-3">Cross-platform intelligence</p>
            {igError && (
              <div className="flex items-center gap-2 text-xs text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-3">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {igError === "no_instagram_business"
                  ? "Instagram account must be a Business or Creator account linked to a Facebook Page."
                  : igError === "no_facebook_page"
                  ? "No Facebook Page found. Link your Instagram to a Facebook Page in Meta settings."
                  : "Instagram connection failed. Please try again."}
              </div>
            )}
            {igStatus?.connected ? (
              <div className="flex items-center gap-3 bg-[#111113] border border-[#27272a] rounded-lg px-4 py-3">
                {igStatus.profilePictureUrl ? (
                  <img src={igStatus.profilePictureUrl} alt={igStatus.username} className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center">
                    <Camera className="w-4 h-4 text-white" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">@{igStatus.username}</p>
                  <p className="text-xs text-zinc-500">{igStatus.followerCount?.toLocaleString()} followers · Connected</p>
                </div>
                <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
              </div>
            ) : (
              <a
                href="/api/auth/instagram"
                className="flex items-center gap-3 bg-[#111113] border border-[#27272a] hover:border-[#ff3040]/40 rounded-lg px-4 py-3 transition-colors group"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center shrink-0">
                  <Camera className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-300 group-hover:text-white transition-colors">Connect Instagram</p>
                  <p className="text-xs text-zinc-600">Optional · Adds cross-platform audience insights to your brief</p>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 transition-colors shrink-0" />
              </a>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
