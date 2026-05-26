import { createClient } from "@/lib/supabase/server";

export async function getUserRole(): Promise<"admin" | "viewer"> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.app_metadata?.role === "viewer" ? "viewer" : "admin";
}
