import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

const VALID_STATUSES = ["to_make", "in_progress", "done"];
const EDITABLE_FIELDS = ["title", "hook", "length", "structure", "why_it_works"] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = request.cookies.get("user_id")?.value;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { id } = await params;

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    updates.status = body.status;
  }

  for (const field of EDITABLE_FIELDS) {
    if (field in body) {
      updates[field] = body[field] ?? null;
    }
  }

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("saved_ideas")
    .update(updates)
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ idea: data });
}
