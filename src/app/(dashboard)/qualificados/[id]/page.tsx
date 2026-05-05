import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Fingerprint } from "lucide-react";
import IndexButton from "@/components/IndexButton";
import DeleteButton from "@/components/DeleteButton";

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export default async function QualificadoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getAdminClient();

  const { data: pessoa } = await supabase
    .from("qualificados")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!pessoa) notFound();

  const { data: embeddings } = await supabase
    .from("face_embeddings")
    .select("id, photo_url, det_score, face_index, created_at")
    .eq("source", "qualificados")
    .eq("source_id", id)
    .order("det_score", { ascending: false });

  const { data: skipped } = await supabase
    .from("face_skipped")
    .select("reason, created_at")
    .eq("source", "qualificados")
    .eq("source_id", id)
    .maybeSingle();

  const fields = [
    { label: "Nome", value: pessoa.nome },
    { label: "Vulgo", value: pessoa.vulgo },
    { label: "CPF", value: pessoa.cpf },
    { label: "RG", value: pessoa.rg },
    { label: "Nascimento", value: pessoa.nascimento },
    { label: "Cidade/UF", value: pessoa.cidade ? `${pessoa.cidade}/${pessoa.uf}` : null },
    { label: "Fonte", value: pessoa.fonte },
    { label: "Fonte ID", value: pessoa.fonte_id },
    { label: "Cadastrado", value: new Date(pessoa.created_at).toLocaleDateString("pt-BR") },
  ];

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/qualificados"
          className="flex items-center gap-2 text-gray-400 hover:text-white text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Link>
        <DeleteButton id={id} nome={pessoa.nome} />
      </div>

      <div className="flex items-start gap-6 mb-8">
        {pessoa.foto_url ? (
          <img
            src={pessoa.foto_url}
            alt={pessoa.nome}
            className="w-28 h-28 rounded-xl object-cover border border-gray-700 flex-shrink-0"
          />
        ) : (
          <div className="w-28 h-28 rounded-xl bg-gray-800 flex-shrink-0 flex items-center justify-center text-gray-500 text-4xl font-bold">
            {pessoa.nome.charAt(0)}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-white">{pessoa.nome}</h1>
          {pessoa.vulgo && <p className="text-gray-400">"{pessoa.vulgo}"</p>}
          {pessoa.observacoes && (
            <p className="text-gray-300 text-sm mt-2 bg-gray-900 border border-gray-800 rounded-lg p-3">
              {pessoa.observacoes}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-8">
        {fields
          .filter((f) => f.value)
          .map((f) => (
            <div key={f.label} className="bg-gray-900 border border-gray-800 rounded-lg p-3">
              <p className="text-gray-500 text-xs mb-0.5">{f.label}</p>
              <p className="text-white text-sm font-medium">{f.value}</p>
            </div>
          ))}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Fingerprint className="w-5 h-5 text-blue-400" />
            <h2 className="font-semibold text-white">Embeddings faciais</h2>
          </div>
          <IndexButton qualificadoId={id} />
        </div>

        {skipped && (
          <p className="text-yellow-400 text-sm bg-yellow-950 border border-yellow-800 rounded-lg px-3 py-2 mb-4">
            Foto ignorada: {skipped.reason}
          </p>
        )}

        {embeddings && embeddings.length > 0 ? (
          <div className="grid grid-cols-3 gap-3">
            {embeddings.map((e) => (
              <div key={e.id} className="relative">
                <img
                  src={e.photo_url}
                  alt=""
                  className="w-full aspect-square object-cover rounded-lg border border-gray-700"
                />
                <span className="absolute bottom-1 right-1 bg-black/70 text-xs text-green-400 px-1.5 py-0.5 rounded">
                  {(e.det_score * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">Nenhum embedding gerado ainda.</p>
        )}
      </div>
    </div>
  );
}
