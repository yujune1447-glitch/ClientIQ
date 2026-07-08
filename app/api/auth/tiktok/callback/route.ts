import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { fetchTikTokUserInfo } from "@/lib/tiktok";

const TIKTOK_API = "https://open.tiktokapis.com/v2";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const stateParam = searchParams.get("state");
  const stateCookie = request.cookies.get("tt_oauth_state")?.value;

  const clearState = (res: NextResponse) => {
    res.cookies.set("tt_oauth_state", "", { maxAge: 0, path: "/" });
    res.cookies.set("tt_code_verifier", "", { maxAge: 0, path: "/" });
    return res;
  };

  try {
  if (!stateCookie || stateParam !== stateCookie) {
    return clearState(NextResponse.redirect(`${APP_URL}/workspace?tiktok_error=state_mismatch`));
  }

  if (!code || error) {
    return clearState(NextResponse.redirect(`${APP_URL}/workspace?tiktok_error=oauth_denied`));
  }

  // No session is fine — a TikTok-first signup bootstraps a new user below.
  const sessionUserId = request.cookies.get("user_id")?.value;

  // PKCE verifier set by the authorize route; TikTok requires it at token exchange.
  const codeVerifier = request.cookies.get("tt_code_verifier")?.value;
  if (!codeVerifier) {
    return clearState(NextResponse.redirect(`${APP_URL}/workspace?tiktok_error=state_mismatch`));
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
      code_verifier: codeVerifier,
    }),
  });

  if (!tokenRes.ok) {
    return clearState(NextResponse.redirect(`${APP_URL}/workspace?tiktok_error=token_failed`));
  }

  const tokenData = await tokenRes.json();
  if (tokenData.error) {
    return clearState(NextResponse.redirect(`${APP_URL}/workspace?tiktok_error=token_failed`));
  }

  const { access_token, refresh_token, expires_in, refresh_expires_in, open_id, scope } = tokenData;

  const user = await fetchTikTokUserInfo(access_token);

  if (!user) {
    return clearState(NextResponse.redirect(`${APP_URL}/workspace?tiktok_error=user_info_failed`));
  }

  const ttOpenId = open_id ?? user.open_id;
  if (!ttOpenId) {
    return clearState(NextResponse.redirect(`${APP_URL}/workspace?tiktok_error=user_info_failed`));
  }

  const supabase = createAdminClient();

  // Resolve the account. Existing session → attach to that user (unchanged).
  // No session → bootstrap a new user keyed by TikTok open_id (TikTok scopes
  // give no email/google_id), mirroring how YouTube's callback upserts on google_id.
  const bootstrapped = !sessionUserId;
  let userId: string;
  if (sessionUserId) {
    userId = sessionUserId;
  } else {
    const { data: newUser, error: userError } = await supabase
      .from("users")
      .upsert({ tiktok_open_id: ttOpenId }, { onConflict: "tiktok_open_id" })
      .select("id")
      .single();
    if (userError || !newUser) {
      return clearState(NextResponse.redirect(`${APP_URL}/?error=signup_failed`));
    }
    userId = newUser.id as string;
  }

  const { data: existing } = await supabase
    .from("tiktok_connections")
    .select("refresh_token")
    .eq("user_id", userId)
    .maybeSingle();

  const refreshTokenToStore = refresh_token ?? existing?.refresh_token ?? null;

  const { error: connError } = await supabase.from("tiktok_connections").upsert(
    {
      user_id: userId,
      open_id: ttOpenId,
      union_id: user.union_id ?? null,
      display_name: user.display_name ?? null,
      avatar_url: user.avatar_url ?? null,
      follower_count: user.follower_count ?? 0,
      following_count: user.following_count ?? 0,
      likes_count: user.likes_count ?? 0,
      video_count: user.video_count ?? 0,
      access_token,
      refresh_token: refreshTokenToStore,
      scope: scope ?? null,
      token_expires_at: new Date(Date.now() + (expires_in ?? 86400) * 1000).toISOString(),
      refresh_token_expires_at: refresh_expires_in
        ? new Date(Date.now() + refresh_expires_in * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (connError) {
    return clearState(NextResponse.redirect(`${APP_URL}/workspace?tiktok_error=db_error`));
  }

  // Bootstrapped signups land on the hub; existing sessions keep their prior
  // destination (/workspace). Re-set the session cookie either way — it's the
  // new user's session on bootstrap, and a harmless no-op for existing sessions.
  const dest = bootstrapped ? "/home" : "/workspace";
  const response = NextResponse.redirect(`${APP_URL}${dest}`);
  response.cookies.set("user_id", userId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return clearState(response);
  } catch {
    return clearState(NextResponse.redirect(`${APP_URL}/workspace?tiktok_error=unexpected`));
  }
}
