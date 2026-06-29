import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;
const FB = "https://graph.facebook.com/v18.0";

async function fbFetch(url: string) {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? `Facebook API error ${res.status}`);
  return data;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code || searchParams.get("error")) {
    return NextResponse.redirect(`${APP_URL}/niche?instagram_error=oauth_denied`);
  }

  const userId = request.cookies.get("user_id")?.value;
  if (!userId) {
    return NextResponse.redirect(`${APP_URL}/?error=not_authenticated`);
  }

  const tokenRes = await fetch(`${FB}/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.INSTAGRAM_APP_ID!,
      client_secret: process.env.INSTAGRAM_APP_SECRET!,
      redirect_uri: process.env.INSTAGRAM_REDIRECT_URI!,
      code,
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${APP_URL}/niche?instagram_error=token_failed`);
  }

  const { access_token: shortLivedToken } = await tokenRes.json();

  const longLivedRes = await fetch(
    `${FB}/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.INSTAGRAM_APP_ID}&client_secret=${process.env.INSTAGRAM_APP_SECRET}&fb_exchange_token=${shortLivedToken}`
  );

  if (!longLivedRes.ok) {
    return NextResponse.redirect(`${APP_URL}/niche?instagram_error=token_failed`);
  }

  const { access_token: userToken, expires_in } = await longLivedRes.json();

  const pagesData = await fbFetch(`${FB}/me/accounts?access_token=${userToken}`);
  const pages: { id: string; name: string; access_token: string }[] = pagesData.data ?? [];

  if (!pages.length) {
    return NextResponse.redirect(`${APP_URL}/niche?instagram_error=no_facebook_page`);
  }

  let igUserId: string | null = null;
  let pageId: string | null = null;
  let pageToken: string | null = null;

  for (const page of pages) {
    const pageData = await fbFetch(
      `${FB}/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
    );
    if (pageData.instagram_business_account?.id) {
      igUserId = pageData.instagram_business_account.id;
      pageId = page.id;
      pageToken = page.access_token;
      break;
    }
  }

  if (!igUserId || !pageToken) {
    return NextResponse.redirect(`${APP_URL}/niche?instagram_error=no_instagram_business`);
  }

  const igUser = await fbFetch(
    `${FB}/${igUserId}?fields=id,username,name,profile_picture_url,followers_count,media_count&access_token=${pageToken}`
  );

  const supabase = createAdminClient();

  await supabase.from("instagram_connections").upsert(
    {
      user_id: userId,
      ig_user_id: igUserId,
      username: igUser.username ?? null,
      name: igUser.name ?? null,
      profile_picture_url: igUser.profile_picture_url ?? null,
      follower_count: igUser.followers_count ?? 0,
      media_count: igUser.media_count ?? 0,
      page_id: pageId,
      page_access_token: pageToken,
      user_access_token: userToken,
      token_expires_at: new Date(Date.now() + (expires_in ?? 5184000) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  return NextResponse.redirect(`${APP_URL}/niche?instagram_connected=1`);
}
