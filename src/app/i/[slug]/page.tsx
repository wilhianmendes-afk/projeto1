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
    .from("ops_intel_link_investigations")
    .select("id, slug, tipo, og_titulo, og_descricao, og_imagem_url, redirect_url, status, pix_banco, pix_valor, pix_data, pix_horario, pix_de_nome, pix_de_cpf, pix_de_banco, pix_para_nome, pix_para_cpf, pix_para_banco, pix_transacao, pix_id, anuncio_plataforma, anuncio_preco, anuncio_imagem_url")
    .eq("slug", slug)
    .single();
  return data;
}

function getSiteInfo(inv: Awaited<ReturnType<typeof getInvestigation>>) {
  if (!inv) return { siteName: "", siteUrl: "" };

  if (inv.tipo === "pix") {
    const banks: Record<string, { name: string; url: string }> = {
      mercado_pago: { name: "Mercado Pago", url: "https://www.mercadopago.com.br" },
      inter:        { name: "Banco Inter",  url: "https://inter.co" },
      caixa:        { name: "Caixa Econômica Federal", url: "https://www.caixa.gov.br" },
    };
    const b = banks[inv.pix_banco || "mercado_pago"] ?? banks.mercado_pago;
    return { siteName: b.name, siteUrl: inv.redirect_url || b.url };
  }

  if (inv.tipo === "anuncio") {
    const plats: Record<string, { name: string; url: string }> = {
      mercadolivre: { name: "Mercado Livre", url: "https://www.mercadolivre.com.br" },
      shopee:       { name: "Shopee",        url: "https://shopee.com.br" },
      olx:          { name: "OLX",           url: "https://www.olx.com.br" },
    };
    const p = plats[inv.anuncio_plataforma || "mercadolivre"] ?? plats.mercadolivre;
    return { siteName: p.name, siteUrl: inv.redirect_url || p.url };
  }

  // reportagem — usa redirect_url (g1, record, sbt, band, instagram...)
  const siteUrl = inv.redirect_url || "https://g1.globo.com";
  const siteName = siteUrl.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  return { siteName, siteUrl };
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const inv = await getInvestigation(params.slug);
  if (!inv) return { title: "Notícia" };

  const title = inv.og_titulo || (inv.tipo === "pix" ? "Comprovante de Pix" : "Notícia");
  const description = inv.og_descricao || (inv.tipo === "pix" ? `R$ ${inv.pix_valor || ""}` : "");
  const { siteName, siteUrl } = getSiteInfo(inv);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: siteUrl,
      siteName,
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
      imagemUrl={inv.tipo === "anuncio" ? (inv.anuncio_imagem_url || inv.og_imagem_url) : inv.og_imagem_url}
      redirectUrl={inv.redirect_url}
      anuncioPlatforma={inv.anuncio_plataforma}
      anuncioPreco={inv.anuncio_preco}
      pix={{
        banco:     inv.pix_banco,
        valor:     inv.pix_valor,
        data:      inv.pix_data,
        horario:   inv.pix_horario,
        de_nome:   inv.pix_de_nome,
        de_cpf:    inv.pix_de_cpf,
        de_banco:  inv.pix_de_banco,
        para_nome: inv.pix_para_nome,
        para_cpf:  inv.pix_para_cpf,
        para_banco:inv.pix_para_banco,
        transacao: inv.pix_transacao,
        id:        inv.pix_id,
      }}
    />
  );
}
