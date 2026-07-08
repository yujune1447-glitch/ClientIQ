import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { revokeTikTokToken } from "@/lib/tiktok";

// Disconnects the current user's TikTok account: revokes the grant on TikTok's
// side (best-effort) and deletes the tiktok_connections row. Chat history lives
// in the browser (localStorage), so it is untouched. Reconnect re-upserts on user_id.
export async function POST(request: NextRequest) {
  const userId = request.cookies.get("user_id")?.value;
  if (!userId) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const supabase = createAdminClient();

  const { data: conn } = await supabase
    .from("tiktok_connections")
    .select("access_token")
    .eq("user_id", userId)
    .maybeSingle();

  // Already disconnected — treat as success (idempotent).
  if (!conn) return NextResponse.json({ success: true, revoked: false });

  let revoked = false;
  if (conn.access_token) {
    revoked = await revokeTikTokToken(conn.access_token);
  }

  const { error } = await supabase
    .from("tiktok_connections")
    .delete()
    .eq("user_id", userId);

  if (error) {
    console.error("[tiktok/disconnect] delete failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log("[tiktok/disconnect] user_id=%s revoked=%s", userId, revoked);
  return NextResponse.json({ success: true, revoked });
}
