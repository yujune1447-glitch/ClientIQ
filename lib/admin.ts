import { createAdminClient } from "@/lib/supabase-admin";

// Internal tools are gated to the owner only. Allowlist defaults to the owner's
// email and can be overridden/extended via ADMIN_EMAIL (comma-separated).
const ADMIN_EMAILS = (process.env.ADMIN_EMAIL ?? "yujune1447@gmail.com")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export async function isAdmin(userId: string | undefined | null): Promise<boolean> {
  if (!userId) return false;
  const supabase = createAdminClient();
  const { data } = await supabase.from("users").select("email").eq("id", userId).single();
  const email = (data?.email ?? "").toLowerCase();
  return email.length > 0 && ADMIN_EMAILS.includes(email);
}
