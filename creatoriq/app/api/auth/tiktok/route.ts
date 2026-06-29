import { NextResponse } from "next/server";
import crypto from "crypto";

export function GET() {
  const state = crypto.randomBytes(16).toString("hex");
  const params = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY!,
    scope: "user.info.basic,user.info.profile,video.list,video.comment.list",
    response_type: "code",
    redirect_uri: process.env.TIKTOK_REDIRECT_URI!,
    state,
  });
  return NextResponse.redirect(
    `https://www.tiktok.com/v2/auth/authorize/?${params}`
  );
}
