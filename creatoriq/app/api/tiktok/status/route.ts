import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

export async function GET(request: NextRequest) {
  const userId = request.cookies.get("user_id")?.value;
  if (!userId) return NextResponse.json({ connected: false });

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("tiktok_connections")
    .select("display_name, follower_count, avatar_url")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return NextResponse.json({ connected: false });

  return NextResponse.json({
    connected: true,
    displayName: data.display_name,
    followerCount: data.follower_count,
    avatarUrl: data.avatar_url,
  });
}
