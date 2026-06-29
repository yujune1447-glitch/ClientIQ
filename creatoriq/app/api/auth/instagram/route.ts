import { NextResponse } from "next/server";

export function GET() {
  const params = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID!,
    redirect_uri: process.env.INSTAGRAM_REDIRECT_URI!,
    scope: "instagram_basic,instagram_manage_insights,pages_show_list",
    response_type: "code",
  });
  return NextResponse.redirect(
    `https://www.facebook.com/v18.0/dialog/oauth?${params}`
  );
}
