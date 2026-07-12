import { cookies } from "next/headers";
import Link from "next/link";
import { PlayCircle, Music2, Camera, Zap, ArrowRight, LayoutDashboard, Settings } from "lucide-react";
import { createAdminClient } from "@/lib/supabase-admin";

const fmt = (n: number) =>
  new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);

// TikTok + Instagram are hidden from the creator path (unlinked, not deleted).
// Flip to true to re-enable their connect cards once those surfaces are finished.
const SHOW_SECONDARY_PLATFORMS: boolean = false;

export default async function HomePage() {
  const cookieStore = await cookies();
  const userId = cookieStore.get("user_id")?.value;

  // Public connection hub: signed-out visitors land here from "Get Started" and
  // pick a platform to connect. Cached data only — no platform API calls, no
  // analysis pipeline triggered here.
  let ytConn: { channel_title: string | null; channel_thumbnail: string | null; subscriber_count: number | null } | null = null;
  let ttConn: { display_name: string | null; avatar_url: string | null; follower_count: number | null } | null = null;

  if (userId) {
    const supabase = createAdminClient();
    const [{ data: yt }, { data: tt }] = await Promise.all([
      supabase
        .from("youtube_connections")
        .select("channel_title, channel_thumbnail, subscriber_count")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("tiktok_connections")
        .select("display_name, avatar_url, follower_count")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    ytConn = yt;
    ttConn = tt;
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-white flex flex-col">
      {/* Nav */}
      <nav className="border-b border-[#1f1f22] px-6 py-4 flex items-center justify-between max-w-5xl mx-auto w-full">
        <Link href="/home" className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#ff3040] rounded-md flex items-center justify-center">
            <Zap className="w-4 h-4 text-white fill-white" />
          </div>
          <span className="font-semibold text-[15px] tracking-tight">Listvin</span>
        </Link>
        {userId && (
          <div className="flex items-center gap-3">
            <Link
              href="/settings"
              className="text-zinc-500 hover:text-white transition-colors"
              aria-label="Settings"
            >
              <Settings className="w-4 h-4" />
            </Link>
            <Link
              href="/workspace"
              className="flex items-center gap-2 text-sm bg-white text-black px-4 py-1.5 rounded-md font-medium hover:bg-zinc-200 transition-colors"
            >
              <LayoutDashboard className="w-4 h-4" />
              Open Dashboard
            </Link>
          </div>
        )}
      </nav>

      {/* Hub */}
      <section className="flex-1 w-full max-w-5xl mx-auto px-6 py-14">
        <div className="mb-10">
          <h1 className="text-2xl font-bold tracking-tight">Your platforms</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Connect your accounts, then open the dashboard for the full cross-platform view.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* YouTube */}
          {ytConn ? (
            <PlatformCard
              href="/workspace"
              icon={<PlayCircle className="w-5 h-5 text-white" />}
              iconBg="bg-[#ff0000]"
              name="YouTube"
              title={ytConn.channel_title ?? "YouTube"}
              avatarUrl={ytConn.channel_thumbnail}
              statLabel="Subscribers"
              statValue={fmt(ytConn.subscriber_count ?? 0)}
            />
          ) : (
            <ConnectCard
              href="/api/auth/youtube"
              icon={<PlayCircle className="w-5 h-5 text-white" />}
              iconBg="bg-[#ff0000]"
              name="YouTube"
              blurb="Analyse your full channel history and get structured briefs."
            />
          )}

          {/* TikTok — hidden from the creator path (unlinked, not deleted) */}
          {SHOW_SECONDARY_PLATFORMS && (ttConn ? (
            <PlatformCard
              href="/workspace"
              icon={<Music2 className="w-5 h-5 text-white" />}
              iconBg="bg-gradient-to-br from-cyan-500 to-[#EE1D52]"
              name="TikTok"
              title={ttConn.display_name ?? "TikTok"}
              avatarUrl={ttConn.avatar_url}
              statLabel="Followers"
              statValue={fmt(ttConn.follower_count ?? 0)}
            />
          ) : (
            <ConnectCard
              href="/api/auth/tiktok"
              icon={<Music2 className="w-5 h-5 text-white" />}
              iconBg="bg-gradient-to-br from-cyan-500 to-[#EE1D52]"
              name="TikTok"
              blurb="Add short-form video signals to your cross-platform picture."
            />
          ))}

          {/* Instagram — hidden from the creator path (unlinked, not deleted) */}
          {SHOW_SECONDARY_PLATFORMS && (
            <div className="bg-[#0d0d0f] border border-[#1a1a1d] rounded-xl p-5 opacity-60 select-none">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-600/40 to-pink-500/40 flex items-center justify-center shrink-0">
                  <Camera className="w-5 h-5 text-white/70" />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 border border-[#27272a] rounded-full px-2 py-0.5">
                  Coming soon
                </span>
              </div>
              <p className="text-sm font-semibold text-zinc-300 mt-4">Instagram</p>
              <p className="text-xs text-zinc-600 mt-1">Blocked pending Meta verification.</p>
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#1f1f22] py-6 px-6 flex items-center justify-center gap-4 text-xs text-zinc-600">
        <Link href="/privacy" className="hover:text-zinc-400 transition-colors">Privacy</Link>
        <span className="text-zinc-800">·</span>
        <Link href="/terms" className="hover:text-zinc-400 transition-colors">Terms</Link>
      </footer>
    </div>
  );
}

function PlatformCard({
  href,
  icon,
  iconBg,
  name,
  title,
  avatarUrl,
  statLabel,
  statValue,
}: {
  href: string;
  icon: React.ReactNode;
  iconBg: string;
  name: string;
  title: string;
  avatarUrl: string | null;
  statLabel: string;
  statValue: string;
}) {
  return (
    <Link
      href={href}
      className="bg-[#111113] border border-[#1f1f22] hover:border-[#27272a] rounded-xl p-5 transition-colors group flex flex-col"
    >
      <div className="flex items-center justify-between">
        <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
          {icon}
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-500">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Connected
        </span>
      </div>
      <div className="flex items-center gap-2.5 mt-4">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
        ) : null}
        <div className="min-w-0">
          <p className="text-[11px] text-zinc-600">{name}</p>
          <p className="text-sm font-semibold text-white truncate">{title}</p>
        </div>
      </div>
      <div className="mt-4 pt-4 border-t border-[#1a1a1d] flex items-end justify-between">
        <div>
          <p className="text-xl font-bold tabular-nums">{statValue}</p>
          <p className="text-[11px] text-zinc-600 mt-0.5">{statLabel}</p>
        </div>
        <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-white transition-colors" />
      </div>
    </Link>
  );
}

function ConnectCard({
  href,
  icon,
  iconBg,
  name,
  blurb,
}: {
  href: string;
  icon: React.ReactNode;
  iconBg: string;
  name: string;
  blurb: string;
}) {
  return (
    <a
      href={href}
      className="bg-[#111113] border border-[#1f1f22] hover:border-[#27272a] rounded-xl p-5 transition-colors group flex flex-col"
    >
      <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
        {icon}
      </div>
      <p className="text-sm font-semibold text-white mt-4">{name}</p>
      <p className="text-xs text-zinc-600 mt-1 flex-1">{blurb}</p>
      <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#ff3040] mt-4">
        Connect {name}
        <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
      </span>
    </a>
  );
}
