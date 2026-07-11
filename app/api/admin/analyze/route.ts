import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isAdmin } from "@/lib/admin";
import { analyzePublicChannel } from "@/lib/public-analysis";

export const maxDuration = 60;

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const userId = cookieStore.get("user_id")?.value;
  if (!(await isAdmin(userId))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  let input = "";
  try {
    const body = (await req.json()) as { input?: unknown };
    if (typeof body.input === "string") input = body.input.trim();
  } catch {
    // fall through to the empty-input check below
  }
  if (!input) {
    return NextResponse.json({ error: "Provide a channel handle or URL" }, { status: 400 });
  }

  try {
    const result = await analyzePublicChannel(input);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 500 },
    );
  }
}
