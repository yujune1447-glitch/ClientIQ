import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { refreshAccessToken } from "@/lib/youtube";

export async function GET(request: NextRequest) {
  const userId = request.cookies.get("user_id")?.value;
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const supabase = createAdminClient();
  const { data: conn } = await supabase
    .from("youtube_connections")
    .select("id, access_token, refresh_token, token_expires_at")
    .eq("user_id", userId)
    .single();

  if (!conn) return NextResponse.json({ error: "No YouTube connection" }, { status: 401 });
  if (!conn.refresh_token) return NextResponse.json({ error: "No refresh token stored" }, { status: 401 });

  const expiresAt = new Date(conn.token_expires_at);
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
  if (expiresAt > fiveMinutesFromNow) {
    return NextResponse.json({ ok: true, refreshed: false });
  }

  try {
    const { accessToken, expiresIn } = await refreshAccessToken(conn.refresh_token);
    await supabase
      .from("youtube_connections")
      .update({
        access_token: accessToken,
        token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      })
      .eq("id", conn.id);
    return NextResponse.json({ ok: true, refreshed: true });
  } catch {
    return NextResponse.json({ error: "needs_reauth" }, { status: 401 });
  }
}
