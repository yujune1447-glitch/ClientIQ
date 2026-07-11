import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { PlayCircle, Zap, ArrowRight } from "lucide-react";

export default async function LandingPage() {
  const cookieStore = await cookies();
  const userId = cookieStore.get("user_id")?.value;
  if (userId) redirect("/home");
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
        <div className="flex items-center gap-4 text-sm text-zinc-500">
          <Link href="/privacy" className="hover:text-white transition-colors hidden sm:inline">Privacy</Link>
          <Link href="/terms" className="hover:text-white transition-colors hidden sm:inline">Terms</Link>
          <a href="/home" className="hover:text-white transition-colors">Sign in</a>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-24 max-w-3xl mx-auto w-full">
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[1.05] mb-6">
          Your weekly
          <br />
          <span className="text-[#ff3040]">YouTube game plan.</span>
        </h1>

        <p className="text-lg text-zinc-400 max-w-xl mb-10 leading-relaxed">
          Connect your channel and get a clear, data-backed brief every week — exactly what to make next, and why.
        </p>

        <a
          href="/api/checkout"
          className="flex items-center gap-2.5 bg-[#ff3040] hover:bg-[#e02030] text-white font-semibold px-6 py-3 rounded-lg transition-colors text-sm"
        >
          <PlayCircle className="w-4 h-4" />
          Start free trial
          <ArrowRight className="w-4 h-4" />
        </a>
        <span className="text-xs text-zinc-600 mt-3">Free to try · No credit card required</span>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#1f1f22] py-6 px-6 flex flex-col items-center gap-3">
        <div className="flex items-center gap-4 text-xs text-zinc-500">
          <Link href="/privacy" className="hover:text-zinc-300 transition-colors">Privacy Policy</Link>
          <span className="text-zinc-800">·</span>
          <Link href="/terms" className="hover:text-zinc-300 transition-colors">Terms of Service</Link>
        </div>
        <p className="text-xs text-zinc-700">
          © 2025 CreatorIQ. Built for creators who take their content seriously.
        </p>
      </footer>
    </div>
  );
}
