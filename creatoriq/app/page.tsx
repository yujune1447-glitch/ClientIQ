import Link from "next/link";
import { cookies } from "next/headers";
import { PlayCircle, BarChart3, Zap, ArrowRight, CheckCircle, Bell } from "lucide-react";
import { createAdminClient } from "@/lib/supabase-admin";

export default async function LandingPage() {
  const cookieStore = await cookies();
  const userId = cookieStore.get("user_id")?.value;
  const isLoggedIn = !!userId;

  let unreadAnalysis: { id: string } | null = null;
  if (userId) {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("analyses")
      .select("id")
      .eq("user_id", userId)
      .eq("is_unread", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    unreadAnalysis = data;
  }
  return (
    <div className="min-h-screen bg-[#09090b] text-white flex flex-col">
      {/* Nav */}
      <nav className="border-b border-[#1f1f22] px-6 py-4 flex items-center justify-between max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#ff3040] rounded-md flex items-center justify-center">
            <Zap className="w-4 h-4 text-white fill-white" />
          </div>
          <span className="font-semibold text-[15px] tracking-tight">CreatorIQ</span>
        </div>
        <div className="flex items-center gap-3">
          <a href="/api/auth/youtube" className="text-sm text-zinc-400 hover:text-white transition-colors">
            Sign in
          </a>
          <Link
            href="/analyzing"
            className="text-sm bg-white text-black px-4 py-1.5 rounded-md font-medium hover:bg-zinc-200 transition-colors"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-24 max-w-4xl mx-auto w-full">
        <div className="inline-flex items-center gap-2 bg-[#1c1c1f] border border-[#27272a] rounded-full px-4 py-1.5 text-xs text-zinc-400 mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-[#ff3040] inline-block" />
          AI-powered content intelligence for YouTube creators
        </div>

        <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[1.05] mb-6">
          Know exactly what
          <br />
          <span className="text-[#ff3040]">to make next.</span>
        </h1>

        <p className="text-lg text-zinc-400 max-w-xl mb-10 leading-relaxed">
          CreatorIQ analyses your entire YouTube history, identifies what&apos;s resonating
          with your audience, and generates your weekly content brief — powered by AI.
        </p>

        {unreadAnalysis && (
          <Link
            href={`/dashboard?id=${unreadAnalysis.id}`}
            className="flex items-center gap-2 bg-[#1a1014] border border-[#ff3040]/40 rounded-lg px-4 py-2.5 mb-6 text-sm text-zinc-200 hover:border-[#ff3040]/70 transition-colors"
          >
            <Bell className="w-4 h-4 text-[#ff3040] shrink-0" />
            Your weekly brief is ready — view it now
            <ArrowRight className="w-3.5 h-3.5 ml-auto text-zinc-500" />
          </Link>
        )}

        <div className="flex flex-col sm:flex-row items-center gap-3">
          {isLoggedIn ? (
            <Link
              href="/niche"
              className="flex items-center gap-2.5 bg-[#ff3040] hover:bg-[#e02030] text-white font-semibold px-6 py-3 rounded-lg transition-colors text-sm"
            >
              <PlayCircle className="w-4 h-4" />
              Run new analysis
              <ArrowRight className="w-4 h-4" />
            </Link>
          ) : (
            <a
              href="/api/auth/youtube"
              className="flex items-center gap-2.5 bg-[#ff3040] hover:bg-[#e02030] text-white font-semibold px-6 py-3 rounded-lg transition-colors text-sm"
            >
              <PlayCircle className="w-4 h-4" />
              Connect your YouTube channel
              <ArrowRight className="w-4 h-4" />
            </a>
          )}
          {!isLoggedIn && <span className="text-xs text-zinc-600">Free to try · No credit card required</span>}
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-[#1f1f22] py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-600 text-center mb-12">
            How it works
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                step: "01",
                title: "Connect YouTube",
                body: "Authorise read access to your channel. We pull your entire video history — every video, every stat.",
                icon: <PlayCircle className="w-5 h-5" />,
              },
              {
                step: "02",
                title: "We analyse everything",
                body: "Our engine calculates channel averages, ranks every video by performance score, and isolates your top and bottom performers.",
                icon: <BarChart3 className="w-5 h-5" />,
              },
              {
                step: "03",
                title: "Get your brief",
                body: "Claude analyses the intelligence and returns a content autopsy and a precise weekly content brief — exactly what to make and why.",
                icon: <Zap className="w-5 h-5" />,
              },
            ].map((item) => (
              <div
                key={item.step}
                className="bg-[#111113] border border-[#1f1f22] rounded-xl p-6 hover:border-[#27272a] transition-colors"
              >
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-xs font-mono text-zinc-600">{item.step}</span>
                  <div className="text-zinc-400">{item.icon}</div>
                </div>
                <h3 className="font-semibold text-[15px] mb-2">{item.title}</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-[#1f1f22] py-20 px-6 bg-[#0d0d0f]">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-600 text-center mb-12">
            What you get
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              "Full channel history analysis — every video scored",
              "Top 10 and bottom 10 performer breakdown",
              "AI-generated weekly content brief with hook and titles",
              "Content autopsy: what's working and what isn't",
              "Audience pattern recognition from your comment data",
              "Outlier detection — your biggest surprise hits and misses",
            ].map((feature) => (
              <div key={feature} className="flex items-start gap-3 py-3">
                <CheckCircle className="w-4 h-4 text-[#ff3040] mt-0.5 shrink-0" />
                <span className="text-sm text-zinc-300">{feature}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-[#1f1f22] py-20 px-6 text-center">
        <div className="max-w-xl mx-auto">
          <h2 className="text-3xl font-bold tracking-tight mb-4">
            Stop guessing. Start growing.
          </h2>
          <p className="text-zinc-500 text-sm mb-8">
            Connect your channel in 30 seconds and get your first content brief today.
          </p>
          {isLoggedIn ? (
            <Link
              href="/niche"
              className="inline-flex items-center gap-2.5 bg-[#ff3040] hover:bg-[#e02030] text-white font-semibold px-6 py-3 rounded-lg transition-colors text-sm"
            >
              <PlayCircle className="w-4 h-4" />
              Run new analysis
            </Link>
          ) : (
            <a
              href="/api/auth/youtube"
              className="inline-flex items-center gap-2.5 bg-[#ff3040] hover:bg-[#e02030] text-white font-semibold px-6 py-3 rounded-lg transition-colors text-sm"
            >
              <PlayCircle className="w-4 h-4" />
              Connect YouTube — it&apos;s free
            </a>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#1f1f22] py-6 px-6 text-center">
        <p className="text-xs text-zinc-700">
          © 2025 CreatorIQ. Built for creators who take their channel seriously.
        </p>
      </footer>
    </div>
  );
}
