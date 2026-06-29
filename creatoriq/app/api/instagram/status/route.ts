import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

export async function GET(request: NextRequest) {
  const userId = request.cookies.get("user_id")?.value;
  if (!userId) return NextResponse.json({ connected: false });

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("instagram_connections")
    .select("username, follower_count, profile_picture_url")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return NextResponse.json({ connected: false });

  return NextResponse.json({
    connected: true,
    username: data.username,
    followerCount: data.follower_count,
    profilePictureUrl: data.profile_picture_url,
  });
}
