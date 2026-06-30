import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code || searchParams.get("error")) {
    return NextResponse.redirect(`${APP_URL}/?error=oauth_denied`);
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.YOUTUBE_CLIENT_ID!,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
      redirect_uri: process.env.YOUTUBE_REDIRECT_URI!,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${APP_URL}/?error=token_failed`);
  }

  const { access_token, refresh_token, expires_in } = await tokenRes.json();

  const [channelRes, profileRes] = await Promise.all([
    fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true", {
      headers: { Authorization: `Bearer ${access_token}` },
    }),
    fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    }),
  ]);

  const [channelData, profile] = await Promise.all([
    channelRes.json(),
    profileRes.json(),
  ]);

  const channel = channelData.items?.[0];
  if (!channel) {
    return NextResponse.redirect(`${APP_URL}/?error=no_channel`);
  }

  const supabase = createAdminClient();

  const { data: user, error: userError } = await supabase
    .from("users")
    .upsert({ google_id: profile.id, email: profile.email }, { onConflict: "google_id" })
    .select("id")
    .single();

  if (userError || !user) {
    return NextResponse.redirect(`${APP_URL}/?error=db_error`);
  }

  await supabase.from("youtube_connections").upsert(
    {
      user_id: user.id,
      channel_id: channel.id,
      channel_title: channel.snippet.title,
      channel_handle: channel.snippet.customUrl ?? null,
      channel_thumbnail: channel.snippet.thumbnails?.default?.url ?? null,
      subscriber_count: parseInt(channel.statistics.subscriberCount ?? "0"),
      video_count: parseInt(channel.statistics.videoCount ?? "0"),
      access_token,
      refresh_token: refresh_token ?? null,
      token_expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,channel_id" }
  );

  const response = NextResponse.redirect(`${APP_URL}/analyzing`);
  response.cookies.set("user_id", user.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });

  return response;
}
