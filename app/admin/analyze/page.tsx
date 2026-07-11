import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import AdminAnalyzeClient from "./AdminAnalyzeClient";

export default async function AdminAnalyzePage() {
  const cookieStore = await cookies();
  const userId = cookieStore.get("user_id")?.value;
  if (!(await isAdmin(userId))) redirect("/");
  return <AdminAnalyzeClient />;
}
