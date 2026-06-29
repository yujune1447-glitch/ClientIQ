"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, Search, ArrowRight } from "lucide-react";

const EXAMPLES = ["faith", "fitness", "finance", "productivity", "cooking", "travel", "gaming", "parenting"];

export default function NichePage() {
  const router = useRouter();

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
        </div>
      </main>
    </div>
  );
}
