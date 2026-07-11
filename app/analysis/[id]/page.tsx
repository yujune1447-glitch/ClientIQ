import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";
import { BriefView } from "@/app/components/BriefView";
import { MarkRead } from "@/app/components/MarkRead";
import type { ChannelSummary, ContentBrief } from "@/types";

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
    .select("id,user_id,summary,brief,is_unread")
    .eq("id", id)
    .single();

  if (!analysis || analysis.user_id !== userId) notFound();

  const brief = (analysis.brief ?? null) as ContentBrief | null;
  const summary = analysis.summary as ChannelSummary;

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {analysis.is_unread === true && <MarkRead analysisId={analysis.id} />}
      {brief ? (
        <BriefView brief={brief} summary={summary} />
      ) : (
        <div className="max-w-3xl mx-auto px-6 py-16 text-center">
          <p className="text-sm text-zinc-500">Your weekly brief is being prepared. Check back shortly.</p>
        </div>
      )}
    </div>
  );
}
