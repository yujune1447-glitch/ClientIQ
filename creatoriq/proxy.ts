import { NextRequest, NextResponse } from "next/server";

const PROTECTED = ["/niche", "/analyzing", "/dashboard"];

export function proxy(request: NextRequest) {
  const userId = request.cookies.get("user_id")?.value;

  if (PROTECTED.some((p) => request.nextUrl.pathname.startsWith(p)) && !userId) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/niche/:path*", "/analyzing/:path*", "/dashboard/:path*"],
};
