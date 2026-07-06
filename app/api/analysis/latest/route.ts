import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

export async function GET(request: NextRequest) {
  const userId = request.cookies.get("user_id")?.value;
  console.log("[api/analysis/latest] user_id=%s", userId ?? "MISSING");

  if (!userId) return NextResponse.json(null, { status: 401 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("analyses")
    .select("id,summary,brief,autopsy,instagram_summary,tiktok_summary,comment_intelligence,is_unread,generated_by,created_at,weekly_subs_gained,weekly_subs_lost")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  console.log("[api/analysis/latest] found=%s err=%s", !!data, error?.message ?? "none");

  return NextResponse.json(data ?? null);
}
