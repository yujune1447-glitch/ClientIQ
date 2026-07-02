import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

export async function GET(request: NextRequest) {
  const userId = request.cookies.get("user_id")?.value;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const platform = new URL(request.url).searchParams.get("platform");
  const supabase = createAdminClient();

  let query = supabase
    .from("saved_ideas")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (platform) query = query.eq("platform", platform);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ideas: data ?? [] });
}

export async function POST(request: NextRequest) {
  const userId = request.cookies.get("user_id")?.value;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { platform, title, hook, length, structure, why_it_works, source, source_chat_id } =
    await request.json();

  if (!platform || !title) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("saved_ideas")
    .insert({
      user_id: userId,
      platform,
      title,
      hook: hook ?? null,
      length: length ?? null,
      structure: structure ?? null,
      why_it_works: why_it_works ?? null,
      source: source ?? "ai",
      source_chat_id: source_chat_id ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ idea: data });
}
