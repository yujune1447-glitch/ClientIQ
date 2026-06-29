import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  const userId = request.cookies.get("user_id")?.value;
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { niche } = await request.json();
  if (!niche?.trim()) return NextResponse.json({ error: "Niche required" }, { status: 400 });

  const supabase = createAdminClient();
  await supabase.from("users").update({ niche: niche.trim().toLowerCase() }).eq("id", userId);

  return NextResponse.json({ ok: true });
}
