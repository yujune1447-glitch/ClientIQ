import { NextRequest, NextResponse } from "next/server";

const PROTECTED = ["/niche", "/analyzing", "/dashboard"];

const TIKTOK_VERIFY = /^\/tiktok([A-Za-z0-9]+)\.txt$/;

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const ttMatch = pathname.match(TIKTOK_VERIFY);
  if (ttMatch) {
    return new NextResponse(`tiktok-developers-site-verification=${ttMatch[1]}`, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const userId = request.cookies.get("user_id")?.value;
  if (PROTECTED.some((p) => pathname.startsWith(p)) && !userId) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/niche/:path*",
    "/analyzing/:path*",
    "/dashboard/:path*",
    "/:file(tiktok[A-Za-z0-9]+\\.txt)",
  ],
};
