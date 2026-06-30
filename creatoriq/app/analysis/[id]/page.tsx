import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Zap, ChevronLeft, Plus } from "lucide-react";
import { createAdminClient } from "@/lib/supabase-admin";
import { AnalysisContent } from "@/app/components/AnalysisContent";
import { ChatPanel } from "@/app/components/ChatPanel";
import type { ChannelSummary, ContentBrief, ContentAutopsy, InstagramSummary, TikTokSummary, CommentIntelligence, ChannelSnapshot } from "@/types";

export default async function AnalysisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const userId = cookieStore.get("user_id")?.value;

  console.log("[analysis-page] Load. id=%s user_id=%s", id, userId ?? "MISSING");

  if (!userId) redirect("/");

  const supabase = createAdminClient();

  const [{ data: analysis, error: analysisErr }, { data: snapshots }] = await Promise.all([
    supabase
      .from("analyses")
      .select("id,summary,brief,autopsy,instagram_summary,tiktok_summary,comment_intelligence,is_unread,generated_by,created_at")
      .eq("id", id)
      .eq("user_id", userId)
      .single(),
    supabase
      .from("channel_snapshots")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
  ]);

  console.log("[analysis-page] analysis_found=%s err=%s", !!analysis, analysisErr?.message ?? "none");

  if (!analysis) {
    console.error("[analysis-page] Analysis not found for id=%s user_id=%s — redirecting to /workspace. err=%j", id, userId, analysisErr);
    redirect("/workspace");
  }

  const data = {
    id: analysis.id,
    createdAt: analysis.created_at,
    summary: analysis.summary as ChannelSummary,
    brief: (analysis.brief ?? null) as ContentBrief | null,
    autopsy: (analysis.autopsy ?? null) as ContentAutopsy | null,
    igSummary: (analysis.instagram_summary ?? null) as InstagramSummary | null,
    tikTokSummary: (analysis.tiktok_summary ?? null) as TikTokSummary | null,
    commentIntel: (analysis.comment_intelligence ?? null) as CommentIntelligence | null,
    isUnread: analysis.is_unread === true,
    isScheduled: analysis.generated_by === "scheduled",
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <nav className="border-b border-[#1f1f22] px-6 py-3 sticky top-0 bg-[#09090b]/95 backdrop-blur-sm z-10">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-[#ff3040] rounded flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-white fill-white" />
            </div>
            <span className="font-semibold text-[14px] tracking-tight">CreatorIQ</span>
          </div>
          <div className="h-4 w-px bg-[#27272a]" />
          <Link
            href="/workspace"
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            All analyses
          </Link>
          <div className="ml-auto">
            <Link
              href="/analyzing"
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New analysis
            </Link>
          </div>
        </div>
      </nav>

      <AnalysisContent
        analysis={data}
        snapshots={(snapshots ?? []) as ChannelSnapshot[]}
      />

      <ChatPanel analysisId={id} />
    </div>
  );
}
