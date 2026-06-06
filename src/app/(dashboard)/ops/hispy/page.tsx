import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import HispyClient from "./HispyClient";

export const dynamic = "force-dynamic";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export default async function HispyPage() {
  const auth = await createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect("/login");

  const supabase = getAdminClient();

  const [{ data: investigations }, { data: captures }] = await Promise.all([
    supabase
      .from("ops_hispy_investigations")
      .select("id, nome, slug, tipo, og_imagem_url, created_at, status")
      .order("created_at", { ascending: false }),
    supabase.from("ops_hispy_captures").select("investigation_id"),
  ]);

  const countMap: Record<string, number> = {};
  for (const c of captures ?? []) {
    countMap[c.investigation_id] = (countMap[c.investigation_id] || 0) + 1;
  }

  const data = (investigations ?? []).map((inv) => ({
    ...inv,
    captures_count: countMap[inv.id] || 0,
  }));

  return <HispyClient investigations={data} />;
}
