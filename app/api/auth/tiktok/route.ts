import { NextResponse } from "next/server";
import crypto from "crypto";

const SCOPES = "user.info.basic,user.info.profile,user.info.stats";

export function GET() {
  const state = crypto.randomBytes(16).toString("hex");

  // PKCE. TikTok requires it and deviates from RFC 7636: code_challenge is the
  // HEX-encoded SHA256 of the verifier (their docs use CryptoJS.enc.Hex), NOT
  // base64url. Method must be S256. code_verifier is 43-128 unreserved chars;
  // 32 random bytes as hex = 64 unreserved chars.
  const codeVerifier = crypto.randomBytes(32).toString("hex");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("hex");

  const params = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY!,
    scope: SCOPES,
    response_type: "code",
    redirect_uri: process.env.TIKTOK_REDIRECT_URI!,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const response = NextResponse.redirect(
    `https://www.tiktok.com/v2/auth/authorize/?${params}`
  );
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 10,
    path: "/",
  };
  response.cookies.set("tt_oauth_state", state, cookieOpts);
  response.cookies.set("tt_code_verifier", codeVerifier, cookieOpts);
  return response;
}
