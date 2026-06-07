import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import InvestigacaoClient from "./InvestigacaoClient";

export const dynamic = "force-dynamic";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export default async function InvestigacaoPage({ params }: { params: { id: string } }) {
  const auth = await createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect("/login");

  const supabase = getAdminClient();

  const [{ data: investigation }, { data: captures }] = await Promise.all([
    supabase.from("ops_intel_link_investigations").select("*").eq("id", params.id).single(),
    supabase
      .from("ops_intel_link_captures")
      .select("*")
      .eq("investigation_id", params.id)
      .order("captured_at", { ascending: false }),
  ]);

  if (!investigation) notFound();

  return <InvestigacaoClient investigation={investigation} captures={captures ?? []} />;
}
