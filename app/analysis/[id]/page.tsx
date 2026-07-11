import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";
import { AnalysisContent, type AnalysisData } from "@/app/components/AnalysisContent";
import type { ChannelSummary, ContentBrief, ContentAutopsy, InstagramSummary, TikTokSummary, CommentIntelligence, ChannelSnapshot } from "@/types";

export default async function AnalysisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const userId = cookieStore.get("user_id")?.value;

  if (!userId) redirect("/");

  const supabase = createAdminClient();

  const { data: analysis } = await supabase
    .from("analyses")
    .select("id,user_id,summary,brief,autopsy,instagram_summary,tiktok_summary,comment_intelligence,is_unread,generated_by,created_at,weekly_subs_gained,weekly_subs_lost")
    .eq("id", id)
    .single();

  if (!analysis || analysis.user_id !== userId) notFound();

  const { data: snapshots } = await supabase
    .from("channel_snapshots")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  const data: AnalysisData = {
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
    weeklySubsGained: analysis.weekly_subs_gained ?? null,
    weeklySubsLost: analysis.weekly_subs_lost ?? null,
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <AnalysisContent analysis={data} snapshots={(snapshots ?? []) as ChannelSnapshot[]} />
    </div>
  );
}
