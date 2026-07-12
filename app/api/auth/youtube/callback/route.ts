import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

export async function GET(request: NextRequest) {
  // Redirect back to the SAME origin this callback is served from — that's the
  // host the user_id cookie is being set on. Using a fixed NEXT_PUBLIC_APP_URL
  // here can drop the cookie if the OAuth redirect_uri domain drifts from it.
  const origin = request.nextUrl.origin;
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  console.log("[yt-callback] Received. code_present=%s error=%s", !!code, searchParams.get("error") ?? "none");

  if (!code || searchParams.get("error")) {
    console.error("[yt-callback] OAuth denied or missing code. error=%s", searchParams.get("error"));
    return NextResponse.redirect(`${origin}/?error=oauth_denied`);
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

  console.log("[yt-callback] Token exchange status=%d", tokenRes.status);

  if (!tokenRes.ok) {
    const errBody = await tokenRes.text();
    console.error("[yt-callback] Token exchange failed: %s", errBody);
    return NextResponse.redirect(`${origin}/?error=token_failed`);
  }

  const tokenData = await tokenRes.json();
  const { access_token, refresh_token, expires_in } = tokenData;

  console.log("[yt-callback] Tokens received. access_token_present=%s refresh_token_present=%s expires_in=%s",
    !!access_token, !!refresh_token, expires_in);

  if (!access_token) {
    console.error("[yt-callback] No access_token in token response: %j", tokenData);
    return NextResponse.redirect(`${origin}/?error=token_failed`);
  }

  const [channelRes, profileRes] = await Promise.all([
    fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true", {
      headers: { Authorization: `Bearer ${access_token}` },
    }),
    fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    }),
  ]);

  console.log("[yt-callback] Channel API status=%d Profile API status=%d", channelRes.status, profileRes.status);

  const [channelData, profile] = await Promise.all([
    channelRes.json(),
    profileRes.json(),
  ]);

  const channel = channelData.items?.[0];
  if (!channel) {
    console.error("[yt-callback] No channel found in response: %j", channelData);
    return NextResponse.redirect(`${origin}/?error=no_channel`);
  }

  console.log("[yt-callback] Channel found: id=%s title=%s", channel.id, channel.snippet?.title);
  console.log("[yt-callback] Google profile: id=%s email=%s", profile.id, profile.email);

  const supabase = createAdminClient();

  const { data: user, error: userError } = await supabase
    .from("users")
    .upsert({ google_id: profile.id, email: profile.email }, { onConflict: "google_id" })
    .select("id")
    .single();

  if (userError || !user) {
    console.error("[yt-callback] User upsert failed: %j", userError);
    return NextResponse.redirect(`${origin}/?error=db_error`);
  }

  console.log("[yt-callback] User upserted/found: user_id=%s", user.id);

  // Check if there's an existing connection with a valid refresh_token we should preserve
  const { data: existing } = await supabase
    .from("youtube_connections")
    .select("id, refresh_token")
    .eq("user_id", user.id)
    .eq("channel_id", channel.id)
    .maybeSingle();

  console.log("[yt-callback] Existing connection found=%s existing_refresh_token_present=%s",
    !!existing, !!existing?.refresh_token);

  // Use the new refresh_token if Google provided one, otherwise preserve the existing one.
  // Google only returns a refresh_token on first auth or when prompt=consent is used and
  // re-consent is granted. Never overwrite a valid existing token with null.
  const refreshTokenToStore = refresh_token ?? existing?.refresh_token ?? null;

  console.log("[yt-callback] refresh_token to store: present=%s source=%s",
    !!refreshTokenToStore,
    refresh_token ? "new_from_google" : existing?.refresh_token ? "preserved_existing" : "none");

  if (!refreshTokenToStore) {
    console.error("[yt-callback] WARNING: No refresh_token available (new or existing). Token refresh will fail when access token expires.");
  }

  const upsertData = {
    user_id: user.id,
    channel_id: channel.id,
    channel_title: channel.snippet.title,
    channel_handle: channel.snippet.customUrl ?? null,
    channel_thumbnail: channel.snippet.thumbnails?.default?.url ?? null,
    subscriber_count: parseInt(channel.statistics.subscriberCount ?? "0"),
    video_count: parseInt(channel.statistics.videoCount ?? "0"),
    access_token,
    refresh_token: refreshTokenToStore,
    token_expires_at: new Date(Date.now() + (expires_in ?? 3599) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error: connError } = await supabase
    .from("youtube_connections")
    .upsert(upsertData, { onConflict: "user_id,channel_id" });

  if (connError) {
    console.error("[yt-callback] youtube_connections upsert FAILED: code=%s message=%s details=%s",
      connError.code, connError.message, connError.details);
    return NextResponse.redirect(`${origin}/?error=db_error`);
  }

  console.log("[yt-callback] youtube_connections upserted OK. Redirecting to /analyzing. user_id=%s", user.id);

  // Post-connect: land on the clean brief flow — shows the latest brief if one
  // exists, otherwise generates the first brief ("your first brief is generating").
  const response = NextResponse.redirect(`${origin}/analyzing`);
  response.cookies.set("user_id", user.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });

  return response;
}
