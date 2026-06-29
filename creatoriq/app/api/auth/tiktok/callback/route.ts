import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

const TIKTOK_API = "https://open.tiktokapis.com/v2";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (!code || error) {
    return NextResponse.redirect(`${APP_URL}/niche?tiktok_error=oauth_denied`);
  }

  const userId = request.cookies.get("user_id")?.value;
  if (!userId) {
    return NextResponse.redirect(`${APP_URL}/?error=not_authenticated`);
  }

  const tokenRes = await fetch(`${TIKTOK_API}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY!,
      client_secret: process.env.TIKTOK_CLIENT_SECRET!,
      code,
      grant_type: "authorization_code",
      redirect_uri: process.env.TIKTOK_REDIRECT_URI!,
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${APP_URL}/niche?tiktok_error=token_failed`);
  }

  const tokenData = await tokenRes.json();
  if (tokenData.error && tokenData.error !== "ok") {
    return NextResponse.redirect(`${APP_URL}/niche?tiktok_error=token_failed`);
  }

  const { access_token, refresh_token, expires_in, refresh_expires_in, open_id } = tokenData;

  const userRes = await fetch(
    `${TIKTOK_API}/user/info/?fields=open_id,union_id,avatar_url,display_name,username,follower_count,following_count,likes_count,video_count`,
    { headers: { Authorization: `Bearer ${access_token}` } }
  );

  if (!userRes.ok) {
    return NextResponse.redirect(`${APP_URL}/niche?tiktok_error=user_info_failed`);
  }

  const userData = await userRes.json();
  const user = userData.data?.user;

  if (!user) {
    return NextResponse.redirect(`${APP_URL}/niche?tiktok_error=user_info_failed`);
  }

  const supabase = createAdminClient();

  await supabase.from("tiktok_connections").upsert(
    {
      user_id: userId,
      open_id: open_id ?? user.open_id,
      union_id: user.union_id ?? null,
      display_name: user.display_name ?? null,
      avatar_url: user.avatar_url ?? null,
      follower_count: user.follower_count ?? 0,
      following_count: user.following_count ?? 0,
      likes_count: user.likes_count ?? 0,
      video_count: user.video_count ?? 0,
      access_token,
      refresh_token: refresh_token ?? null,
      token_expires_at: new Date(Date.now() + (expires_in ?? 86400) * 1000).toISOString(),
      refresh_token_expires_at: refresh_expires_in
        ? new Date(Date.now() + refresh_expires_in * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  return NextResponse.redirect(`${APP_URL}/niche?tiktok_connected=1`);
}
