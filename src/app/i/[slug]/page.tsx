import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import BaitCapture from "./BaitCapture";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function getInvestigation(slug: string) {
  const supabase = getAdminClient();
  const { data } = await supabase
    .from("ops_hispy_investigations")
    .select("id, slug, tipo, og_titulo, og_descricao, og_imagem_url, status")
    .eq("slug", slug)
    .single();
  return data;
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const inv = await getInvestigation(params.slug);
  if (!inv) return { title: "Notícia" };

  const title = inv.og_titulo || (inv.tipo === "pix" ? "Cobrança Pendente" : "Notícia");
  const description = inv.og_descricao || "";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: inv.og_imagem_url ? [{ url: inv.og_imagem_url, width: 1200, height: 630 }] : [],
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: inv.og_imagem_url ? [inv.og_imagem_url] : [],
    },
  };
}

export default async function BaitPage({ params }: { params: { slug: string } }) {
  const inv = await getInvestigation(params.slug);
  if (!inv) notFound();

  return (
    <BaitCapture
      slug={inv.slug}
      tipo={inv.tipo}
      titulo={inv.og_titulo}
      descricao={inv.og_descricao}
      imagemUrl={inv.og_imagem_url}
    />
  );
}
