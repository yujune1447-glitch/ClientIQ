import { cookies } from "next/headers";
import Link from "next/link";
import { Zap, LayoutDashboard } from "lucide-react";
import { createAdminClient } from "@/lib/supabase-admin";
import ConnectedAccounts from "./ConnectedAccounts";

export default async function SettingsPage() {
  const cookieStore = await cookies();
  const userId = cookieStore.get("user_id")?.value;

  let youtube: { title: string; avatarUrl: string | null } | null = null;
  let tiktok: { title: string; avatarUrl: string | null } | null = null;

  if (userId) {
    const supabase = createAdminClient();
    const [{ data: yt }, { data: tt }] = await Promise.all([
      supabase
        .from("youtube_connections")
        .select("channel_title, channel_thumbnail")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("tiktok_connections")
        .select("display_name, avatar_url")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    if (yt) youtube = { title: yt.channel_title ?? "YouTube", avatarUrl: yt.channel_thumbnail ?? null };
    if (tt) tiktok = { title: tt.display_name ?? "TikTok", avatarUrl: tt.avatar_url ?? null };
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-white flex flex-col">
      <nav className="border-b border-[#1f1f22] px-6 py-4 flex items-center justify-between max-w-2xl mx-auto w-full">
        <Link href="/home" className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#ff3040] rounded-md flex items-center justify-center">
            <Zap className="w-4 h-4 text-white fill-white" />
          </div>
          <span className="font-semibold text-[15px] tracking-tight">CreatorIQ</span>
        </Link>
        <Link
          href="/workspace"
          className="flex items-center gap-2 text-sm bg-white text-black px-4 py-1.5 rounded-md font-medium hover:bg-zinc-200 transition-colors"
        >
          <LayoutDashboard className="w-4 h-4" />
          Open Dashboard
        </Link>
      </nav>

      <section className="flex-1 w-full max-w-2xl mx-auto px-6 py-14">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-zinc-500 mt-1">Manage your connected accounts.</p>
        </div>

        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-600 mb-3">
          Connected accounts
        </h2>
        <ConnectedAccounts youtube={youtube} tiktok={tiktok} />

        <p className="text-xs text-zinc-600 mt-6 leading-relaxed">
          Disconnecting revokes CreatorIQ&apos;s access and removes your stored data for that
          account. Your chat history stays available. You can reconnect anytime.
        </p>
      </section>

      <footer className="border-t border-[#1f1f22] py-6 px-6 flex items-center justify-center gap-4 text-xs text-zinc-600">
        <Link href="/privacy" className="hover:text-zinc-400 transition-colors">Privacy</Link>
        <span className="text-zinc-800">·</span>
        <Link href="/terms" className="hover:text-zinc-400 transition-colors">Terms</Link>
      </footer>
    </div>
  );
}
